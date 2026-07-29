// KBO 데이터 수집기.
//
// 1순위: api-sports Baseball ($8/월)  — API_BASEBALL_KEY 가 설정돼 있으면 사용
// 2순위(폴백): TheSportsDB 무료      — 키가 없을 때만, 데이터 한정적
//
// KBO 리그 ID:
//   - api-sports baseball: KBO_LEAGUE_ID 상수 (키 발급 후 실제 호출로 검증·확정)
//   - TheSportsDB: 4830

import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";
import {
  fetchGames,
  isApiBaseballEnabled,
  type ApiBaseballGame,
} from "./api-baseball";
import { fetchSeasonEvents, type TheSportsDBEvent } from "./thesportsdb";
import { isBaseballAllStarMatch } from "./baseball/allstar";

// api-sports baseball KBO 리그 ID — 실제 응답으로 확인 (id=5).
// (id=55 는 "KBO Futures League" 2군 리그라 별도)
const KBO_API_BASEBALL_ID = 5;
const KBO_THESPORTSDB_ID = "4830";

// === 한글 팀명 매핑 (양 소스 모두 영문 응답이라 공용 사용) ===
const TEAM_NAME_KO: Record<string, string> = {
  "KIA Tigers": "KIA 타이거즈",
  "Samsung Lions": "삼성 라이온즈",
  "LG Twins": "LG 트윈스",
  "Doosan Bears": "두산 베어스",
  "KT Wiz": "KT 위즈",
  "KT Wiz Suwon": "KT 위즈",
  "SSG Landers": "SSG 랜더스",
  "Lotte Giants": "롯데 자이언츠",
  "Hanwha Eagles": "한화 이글스",
  "NC Dinos": "NC 다이노스",
  "Kiwoom Heroes": "키움 히어로즈",
};
const TEAM_NAME_KO_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_NAME_KO).map(([k, v]) => [k.toLowerCase(), v]),
);
export function kboEnglishToKorean(name: string | undefined): string {
  return toKorean(name);
}
function toKorean(name: string | undefined): string {
  if (!name) return "";
  return TEAM_NAME_KO_LOWER[name.toLowerCase()] ?? name;
}

function getSeason(date: string): number {
  return new Date(date).getFullYear();
}

function parseScore(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// === api-sports baseball status → 정규화 ===
function mapApiBaseballStatus(short: string): MatchStatus {
  const s = (short ?? "").toUpperCase();
  if (s === "FT" || s === "AOT" || s === "CANC_FT") return "FINISHED";
  // ABD(Abandoned)·SUSP(Suspended) 도 미성립/중단 경기 — 축구 collector 와 동일하게 POSTPONED.
  // 누락 시 fallback SCHEDULED 로 떨어져 진행 중 점수가 "예정" 으로 오표시됨.
  if (s === "POST" || s === "CANC" || s === "ABD" || s === "SUSP") return "POSTPONED";
  if (
    s.startsWith("IN") || // IN1~IN9 (이닝 진행 중)
    s === "LIVE" ||
    s === "INPL" ||
    s === "ITC" // interruption
  )
    return "LIVE";
  return "SCHEDULED";
}

// === TheSportsDB status → 정규화 ===
function mapTheSportsDBStatus(
  status: string | undefined,
  hasScore: boolean,
): MatchStatus {
  const s = (status ?? "").toUpperCase();
  if (s === "FT" || s === "AOT" || s.includes("FINISH")) return "FINISHED";
  if (s.includes("POST") || s === "PPD") return "POSTPONED";
  if (s === "LIVE" || s.includes("PROGRESS")) return "LIVE";
  if (hasScore && !s) return "FINISHED";
  return "SCHEDULED";
}

// ===== 정규화 함수 =====

function normalizeFromApiBaseball(g: ApiBaseballGame): NormalizedMatch {
  const homeScore = parseScore(g.scores?.home?.total ?? null);
  const awayScore = parseScore(g.scores?.away?.total ?? null);

  return {
    league: "KBO",
    externalId: String(g.id),
    homeTeam: {
      externalId: String(g.teams.home.id),
      name: toKorean(g.teams.home.name),
      logoUrl: g.teams.home.logo,
    },
    awayTeam: {
      externalId: String(g.teams.away.id),
      name: toKorean(g.teams.away.name),
      logoUrl: g.teams.away.logo,
    },
    homeScore,
    awayScore,
    status: mapApiBaseballStatus(g.status.short),
    startTime: new Date(g.date),
    raw: g,
  };
}

function normalizeFromTheSportsDB(e: TheSportsDBEvent): NormalizedMatch {
  const homeScore = parseScore(e.intHomeScore);
  const awayScore = parseScore(e.intAwayScore);
  const startTime = e.strTimestamp
    ? new Date(e.strTimestamp)
    : new Date(`${e.dateEvent}T09:30:00Z`);

  return {
    league: "KBO",
    externalId: String(e.idEvent),
    homeTeam: {
      externalId: String(e.idHomeTeam ?? ""),
      name: toKorean(e.strHomeTeam),
      logoUrl: e.strHomeTeamBadge ?? undefined,
    },
    awayTeam: {
      externalId: String(e.idAwayTeam ?? ""),
      name: toKorean(e.strAwayTeam),
      logoUrl: e.strAwayTeamBadge ?? undefined,
    },
    homeScore,
    awayScore,
    status: mapTheSportsDBStatus(
      e.strStatus,
      homeScore !== undefined || awayScore !== undefined,
    ),
    startTime,
    raw: e,
  };
}

export const kboCollector: MatchCollector = {
  league: "KBO",

  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    const season = getSeason(date);

    // 1순위: api-sports baseball (유료, 풀 데이터)
    if (isApiBaseballEnabled()) {
      const games = await fetchGames({
        leagueId: KBO_API_BASEBALL_ID,
        season,
        date,
      });
      // 올스타전(드림 vs 나눔)은 정규 리그 팀이 아니라 파워랭킹·순위를 오염시킨다 → 제외
      return games.map(normalizeFromApiBaseball).filter((m) => !isBaseballAllStarMatch(m));
    }

    // 폴백: TheSportsDB (무료, 데이터 한정적)
    const all = await fetchSeasonEvents(KBO_THESPORTSDB_ID, String(season));
    return all
      .filter((e) => e.dateEvent === date)
      .map(normalizeFromTheSportsDB)
      .filter((m) => !isBaseballAllStarMatch(m));
  },
};
