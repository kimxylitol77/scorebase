// TheSports baseball cache (TheSportsMatchCache.detailLive) → BaseballLive 변환.
//
// /api/live/baseball/[gameId] 가 api-sports 호출 대신 TheSports cache 를 우선 source 로
// 사용해 일일 한도 7500 회피. cache 가 없거나 score 추출 불가하면 호출 측이 api-sports
// fallback 진행.
//
// cache 채우는 경로:
//   - Lightsail baseball-poller.js (1분 주기 detail_live REST)
//   - Lightsail baseball-ws-subscriber.js (MQTT push, 1-2초)
// 두 경로 모두 detail_live entry 형식을 그대로 detailLive 에 upsert.
//
// detailLive 구조 (sample 검증 2026-05-23):
//   {
//     id: "n54ql2s3ey8ymvy",
//     extra: { good, bad, base, out },
//     score: [tsId, statusId, half, { ft, e, h, p1, p2, ... }],
//     stats: [[0, [[stat_type_id, home_value, away_value], ...]]],
//     players: { home: [...], away: [...] }  (옵션)
//   }
//
// ft = [home, away] 순서 (2026-05-24 네이버 KBO 5경기 검증 확정):
//   - NC vs KT 수원: cache.ft=["3","8"], 네이버=KT(home) 4, NC(away) 8 → ft[0]=home, ft[1]=away
//   - 키움 vs LG 잠실: cache.ft=["3","4"], 네이버=LG(home) 3, 키움(away) 4 → 일치
//   - 두산 vs 한화 대전: cache.ft=["5","2"], 네이버=한화(home) 5, 두산(away) 2 → 일치
//   - 삼성 vs 롯데 사직: cache.ft=["0","10"], 네이버=롯데(home) 0, 삼성(away) 10 → 일치
// pN = [home, away] 동일.
// (이전 commit 97a5f02 의 [away, home] 정정은 KIA vs SSG 한 케이스만 보고 잘못 결론.
//  사실 그 매치는 DB.home/away team 매핑 자체가 거꾸로 들어와서 그렇게 보였던 것.)

import type { MatchStatus } from "../types";

// /api/live/baseball/[gameId] route.ts 의 BaseballLive 와 동일 (import 순환 회피 위해 재선언).
export interface BaseballLiveCompat {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string;
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: { name: string; score: number; hits: number | null; errors: number | null };
  awayTeam: { name: string; score: number; hits: number | null; errors: number | null };
  league: { id: number; name: string };
  liveContext?: {
    bases: string;
    outs: number;
    good: number | null;
    bad: number | null;
  } | null;
}

interface TSScoresObj {
  ft?: [string, string];
  e?: [string, string];
  h?: [string, string];
  [pN: `p${number}`]: [string, string] | undefined;
}

interface TSCacheDetailLive {
  id?: string;
  extra?: {
    good?: number;
    bad?: number;
    base?: string;
    out?: number;
  };
  // score = [tsId, statusId, half, scoresObj]
  score?: [string, number, number, TSScoresObj];
}

const LEAGUE_AB_ID: Record<"KBO" | "NPB" | "MLB", number> = {
  KBO: 5,
  NPB: 2,
  MLB: 1,
};

const LEAGUE_AB_NAME: Record<"KBO" | "NPB" | "MLB", string> = {
  KBO: "KBO League",
  NPB: "Nippon Professional Baseball",
  MLB: "Major League Baseball",
};

function parseSc(s?: string): number | null {
  if (!s || s === "X" || s === "-") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * TheSports cache → BaseballLive. 변환 실패 (cache 없거나 score 누락) 시 null.
 * 호출 측은 null 이면 api-sports fallback.
 *
 * 안전장치: cache.ft 가 DB.Match 점수와 일치할 때만 사용.
 * 검증 결과 종료 직전 ws-subscriber 가 마지막 score 메시지 miss 가능
 * (KBO 매치 sample 2/5 cache 1-2점 stale). cache stale 시 helper 가 null
 * 반환 → 호출 측에서 api-sports fallback 으로 정확한 최종 점수 보장.
 */
export function convertCacheToBaseballLive(opts: {
  detailLive: unknown;
  dbStatus: MatchStatus;
  dbHomeScore: number | null;
  dbAwayScore: number | null;
  homeName: string;
  awayName: string;
  league: "KBO" | "NPB" | "MLB";
}): BaseballLiveCompat | null {
  const dl = opts.detailLive as TSCacheDetailLive | null;
  if (!dl || typeof dl !== "object") return null;

  const scoreArr = dl.score;
  if (!Array.isArray(scoreArr) || scoreArr.length < 4) return null;
  const sObj = scoreArr[3];
  if (!sObj || typeof sObj !== "object") return null;
  const ft = sObj.ft;
  if (!Array.isArray(ft) || ft.length !== 2) return null;

  // 점수 (ft = [home, away])
  const homeScore = parseSc(ft[0]) ?? 0;
  const awayScore = parseSc(ft[1]) ?? 0;

  // cache vs DB 점수 일치 검증 — 불일치 시 cache stale 로 판단, fallback 유도.
  // DB 점수 null (예정 매치) 인 경우는 검증 skip (cache 가 사실상 source).
  if (opts.dbHomeScore != null && opts.dbAwayScore != null) {
    if (homeScore !== opts.dbHomeScore || awayScore !== opts.dbAwayScore) {
      return null;
    }
  }

  // 이닝별 — p1, p2, ..., p20 까지 탐색 (pN = [home, away])
  const homeInnings: (number | null)[] = [];
  const awayInnings: (number | null)[] = [];
  let maxInning = 0;
  let isExtra = false;
  for (let i = 1; i <= 20; i++) {
    const p = sObj[`p${i}` as `p${number}`];
    if (!p) continue;
    maxInning = i;
    homeInnings.push(parseSc(p[0]));
    awayInnings.push(parseSc(p[1]));
  }

  // 연장: TheSports 가 연장 이닝별(p10+) 미제공, ft(연장 포함 총점)만 줌
  // → ft - 9회합 > 0 이면 "연장" 통합 칸 1개 추가 (10/11/12 이닝별은 소스 한계).
  if (homeInnings.length >= 9) {
    let sumH = 0;
    let sumA = 0;
    for (const v of homeInnings) sumH += v ?? 0;
    for (const v of awayInnings) sumA += v ?? 0;
    if (homeScore > sumH || awayScore > sumA) {
      homeInnings.push(homeScore - sumH);
      awayInnings.push(awayScore - sumA);
      isExtra = true;
    }
  }

  // hits / errors ([home, away])
  const hitsHome = sObj.h ? parseSc(sObj.h[0]) : null;
  const hitsAway = sObj.h ? parseSc(sObj.h[1]) : null;
  const errHome = sObj.e ? parseSc(sObj.e[0]) : null;
  const errAway = sObj.e ? parseSc(sObj.e[1]) : null;

  // status / label — DB.Match.status 우선
  // halfTopBot = score[2] (1=top/초, 2=bottom/말 추정)
  const halfTopBot = scoreArr[2];
  let status: BaseballLiveCompat["status"];
  let statusLabel: string;
  if (opts.dbStatus === "FINISHED") {
    status = "FINAL";
    statusLabel = "Finished";
  } else if (opts.dbStatus === "LIVE") {
    status = "LIVE";
    const half = halfTopBot === 2 ? "말" : halfTopBot === 1 ? "초" : "";
    statusLabel = isExtra
      ? "연장"
      : maxInning > 0
        ? `${maxInning}회 ${half}`.trim()
        : "Inning -";
  } else {
    status = "PRE";
    statusLabel = "Not Started";
  }

  // liveContext (KBO/NPB 베이스 + B/S/O)
  const liveContext = dl.extra
    ? {
        bases: dl.extra.base ?? "000",
        outs: dl.extra.out ?? 0,
        good: dl.extra.good ?? null,
        bad: dl.extra.bad ?? null,
      }
    : null;

  return {
    status,
    statusLabel,
    linescore: maxInning > 0 ? { home: homeInnings, away: awayInnings } : null,
    homeTeam: {
      name: opts.homeName,
      score: homeScore,
      hits: hitsHome,
      errors: errHome,
    },
    awayTeam: {
      name: opts.awayName,
      score: awayScore,
      hits: hitsAway,
      errors: errAway,
    },
    league: { id: LEAGUE_AB_ID[opts.league], name: LEAGUE_AB_NAME[opts.league] },
    liveContext,
  };
}
