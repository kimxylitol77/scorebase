// KBO 선발 투수 — 내프야(mykbo.statiz.co.kr/minigame/?m=sp) scraping.
// statiz 측 공식 무료 데이터. .game_item 카드 5개 (매일 매치 5경기).
//
// HTML 구조 (확인 완료, 2026-05 시점):
//   .game_item 안에 .teamText 2개 = [팀A, 팀B] (KBO 짧은 약칭: 삼성·LG·KT·SSG 등)
//   같은 .game_item 텍스트: "{팀A} vs {팀B}{투수A}{팀A}{확률}%선수 상세선발승 없음{확률}%{투수B}{팀B}{확률}%선수 상세"
//   "선수 상세" 링크 = href "javascript:showPlayerInfo({statizPlayerId},2026)" — 양 투수 statiz ID 2개

import axios from "axios";
import * as cheerio from "cheerio";
import {
  fetchKboPitcherIndex,
  fetchKboPitcherDetail,
  computeKboRecentForm,
  findKboIdByName,
  calcK9,
  type KboPitcherIndexEntry,
} from "./kbo-official";
import { calcFip, calcLobPct } from "./baseball-saber";

const MYKBO_URL = "https://mykbo.statiz.co.kr/minigame/?m=sp";

export interface KboPitcherFullStats {
  era?: number;
  whip?: number;
  k9?: number;
  wins?: number;
  losses?: number;
  ip?: string;
  k?: number;
  bb?: number;
  qs?: number;
  avg?: number; // 피안타율
  hr?: number;
  fip?: number; // 수비 무관 평자책 (리그 상수 근사)
  lobPct?: number; // 잔루 처리율 % (높을수록 좋음)
  /** 최근 3등판 ERA (ER·IP 합산) */
  recentEra?: number;
  /** 최근 3등판 평균 이닝 */
  recentIp?: number;
}

export interface KboStarter {
  /** 화면상 팀 A (mykbo 순서 그대로 — home/away 보장 안 함, 매칭 단계에서 양 방향) */
  teamA: string; // 약칭 (예: "삼성")
  teamB: string;
  pitcherA: { name: string; statizId?: number; kboId?: string; stats?: KboPitcherFullStats };
  pitcherB: { name: string; statizId?: number; kboId?: string; stats?: KboPitcherFullStats };
}

// statiz 약칭 → 우리 DB Team.name (한국 정식명) 매핑.
// kbo.ts 의 TEAM_NAME_KO 와 일치하는 키 사용.
const TEAM_ABBR_TO_NAME: Record<string, string> = {
  "삼성": "삼성 라이온즈",
  "LG": "LG 트윈스",
  "한화": "한화 이글스",
  "키움": "키움 히어로즈",
  "SSG": "SSG 랜더스",
  "KT": "KT 위즈",
  "두산": "두산 베어스",
  "KIA": "KIA 타이거즈",
  "기아": "KIA 타이거즈",
  "NC": "NC 다이노스",
  "롯데": "롯데 자이언츠",
};

export function kboAbbrToFullName(abbr: string): string | null {
  return TEAM_ABBR_TO_NAME[abbr.trim()] ?? null;
}

/** 풀네임 → 약칭 역방향 (예: "KIA 타이거즈" → "KIA"). 삽입 순서상 정식 약칭 우선. */
export function kboFullNameToAbbr(fullName: string): string | null {
  for (const [abbr, full] of Object.entries(TEAM_ABBR_TO_NAME)) {
    if (full === fullName) return abbr;
  }
  return null;
}

/**
 * 오늘 KBO 선발 투수 매치업 fetch.
 * mykbo 페이지가 "오늘" 기준 — 다른 날짜는 별도 호출 (현재는 today 만).
 */
export async function fetchKboStartersToday(): Promise<KboStarter[]> {
  let html: string;
  try {
    const r = await axios.get<string>(MYKBO_URL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Safari/605.1.15",
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: 12000,
      responseType: "text",
    });
    html = r.data;
  } catch (e) {
    console.warn("[kbo-starters] mykbo fetch 실패:", (e as Error).message);
    return [];
  }

  const $ = cheerio.load(html);
  const items = $(".game_item");
  const result: KboStarter[] = [];

  items.each((_, el) => {
    const teamTexts = $(el)
      .find(".teamText")
      .map((_, t) => $(t).text().trim())
      .get();
    if (teamTexts.length < 2) return;
    const [teamA, teamB] = teamTexts;

    // 투수 statiz ID — "javascript:showPlayerInfo(11379,2026)" 패턴
    const statizIds: number[] = [];
    $(el)
      .find("a")
      .each((_, a) => {
        const href = $(a).attr("href") ?? "";
        const m = href.match(/showPlayerInfo\((\d+),/);
        if (m) statizIds.push(Number(m[1]));
      });

    // 투수 이름 추출 — 텍스트에서 패턴 분리
    // "{팀A} vs {팀B}{투수A}{팀A}{확률}%선수 상세선발승 없음{확률}%{투수B}{팀B}{확률}%선수 상세"
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const marker = ` vs ${teamB}`;
    const afterVs = text.includes(marker)
      ? text.slice(text.indexOf(marker) + marker.length)
      : "";
    // afterVs = "{투수A}{팀A}{확률}%선수 상세선발승 없음{확률}%{투수B}{팀B}{확률}%선수 상세"
    const pitcherARaw = afterVs.slice(0, afterVs.indexOf(teamA));
    const midMarker = "선발승 없음";
    const afterMid = text.lastIndexOf(midMarker) >= 0
      ? text.slice(text.lastIndexOf(midMarker) + midMarker.length)
      : "";
    // afterMid = "{확률}%{투수B}{팀B}{확률}%선수 상세"
    const pitcherBRaw = afterMid.replace(/^\d+%/, "").split(teamB)[0] ?? "";

    const cleanName = (s: string) => s.replace(/^\d+%/, "").replace(/[^가-힣A-Za-z\s]/g, "").trim();
    const pitcherA = cleanName(pitcherARaw);
    const pitcherB = cleanName(pitcherBRaw);
    if (!pitcherA || !pitcherB) return;

    result.push({
      teamA,
      teamB,
      pitcherA: { name: pitcherA, statizId: statizIds[0] },
      pitcherB: { name: pitcherB, statizId: statizIds[1] },
    });
  });

  return result;
}

/**
 * 위 starters 에 KBO 공식 사이트 (koreabaseball.com) 시즌 stats 보강.
 * 한 번의 인덱스 fetch (모든 시즌 등재 투수) 후 각 선발 투수 stats fetch.
 * 매핑 실패한 선수는 stats 없이 이름만 유지.
 */
export async function enrichKboStartersWithStats(
  starters: KboStarter[],
): Promise<KboStarter[]> {
  if (starters.length === 0) return starters;
  let index: KboPitcherIndexEntry[];
  try {
    index = await fetchKboPitcherIndex();
  } catch (e) {
    console.warn("[kbo-starters] KBO 공식 인덱스 fetch 실패:", (e as Error).message);
    return starters;
  }
  if (index.length === 0) return starters;

  const enrichOne = async (
    p: KboStarter["pitcherA"],
    teamHint?: string,
  ): Promise<KboStarter["pitcherA"]> => {
    const kboId = findKboIdByName(index, p.name, teamHint);
    if (!kboId) return p;
    try {
      const { stats: st, recent } = await fetchKboPitcherDetail(kboId);
      if (!st) return { ...p, kboId };
      const k9 = calcK9(st.k, st.ip);
      const form = computeKboRecentForm(recent);
      return {
        ...p,
        kboId,
        stats: {
          era: st.era,
          whip: st.whip,
          k9: k9 ?? undefined,
          wins: st.wins,
          losses: st.losses,
          ip: st.ip,
          k: st.k,
          bb: st.bb,
          qs: st.qs,
          avg: st.avg,
          hr: st.hr,
          fip: calcFip({ league: "KBO", hr: st.hr, bb: st.bb, hbp: st.hbp, k: st.k, ip: st.ip }),
          lobPct: calcLobPct({ hits: st.hits, bb: st.bb, hbp: st.hbp, r: st.r, hr: st.hr }),
          recentEra: form ? Number(form.recentEra.toFixed(2)) : undefined,
          recentIp: form ? Number(form.recentIp.toFixed(1)) : undefined,
        },
      };
    } catch {
      return { ...p, kboId };
    }
  };

  const enriched: KboStarter[] = [];
  for (const s of starters) {
    const [a, b] = await Promise.all([
      enrichOne(s.pitcherA, s.teamA),
      // KBO 사이트 burst 회피 위해 살짝 sleep
      new Promise<KboStarter["pitcherB"]>(async (resolve) => {
        await new Promise((r) => setTimeout(r, 400));
        resolve(await enrichOne(s.pitcherB, s.teamB));
      }),
    ]);
    enriched.push({ ...s, pitcherA: a, pitcherB: b });
    await new Promise((r) => setTimeout(r, 400));
  }
  return enriched;
}

/**
 * 매치의 양 팀 풀네임을 받아 양쪽 선발 투수를 매칭.
 * mykbo 의 teamA/teamB 순서는 home/away 보장 안 함 — 양 방향 매칭.
 */
export function pickStartersForMatch(
  starters: KboStarter[],
  homeName: string,
  awayName: string,
): { home: KboStarter["pitcherA"]; away: KboStarter["pitcherB"] } | null {
  for (const s of starters) {
    const fullA = kboAbbrToFullName(s.teamA);
    const fullB = kboAbbrToFullName(s.teamB);
    if (!fullA || !fullB) continue;
    if (fullA === homeName && fullB === awayName) {
      return { home: s.pitcherA, away: s.pitcherB };
    }
    if (fullA === awayName && fullB === homeName) {
      return { home: s.pitcherB, away: s.pitcherA };
    }
  }
  return null;
}
