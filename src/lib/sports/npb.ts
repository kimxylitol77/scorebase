// NPB (Nippon Professional Baseball) 데이터 수집기.
//
// 소스: api-sports Baseball Pro ($8/월) — API_BASEBALL_KEY 공유.
// NPB 리그 ID: api-sports baseball 응답에서 검증 → id=2.
// 시즌: 단일연도 (예: 2026).

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

const NPB_API_BASEBALL_ID = 2;

// === 한글 팀명 매핑 (한국 미디어 관행) ===
const TEAM_NAME_KO: Record<string, string> = {
  // 센트럴 리그
  "Yomiuri Giants": "요미우리 자이언츠",
  "Hanshin Tigers": "한신 타이거스",
  "Yokohama BayStars": "요코하마 디엔에이 베이스타스",
  "Yokohama DeNA BayStars": "요코하마 디엔에이 베이스타스",
  "Hiroshima Carp": "히로시마 도요 카프",
  "Hiroshima Toyo Carp": "히로시마 도요 카프",
  "Chunichi Dragons": "주니치 드래곤스",
  "Yakult Swallows": "도쿄 야쿠르트 스왈로스",
  "Tokyo Yakult Swallows": "도쿄 야쿠르트 스왈로스",
  // 퍼시픽 리그
  "SoftBank Hawks": "후쿠오카 소프트뱅크 호크스",
  "Fukuoka SoftBank Hawks": "후쿠오카 소프트뱅크 호크스",
  "Nippon Ham Fighters": "홋카이도 닛폰햄 파이터즈",
  "Hokkaido Nippon-Ham Fighters": "홋카이도 닛폰햄 파이터즈",
  "Chiba Lotte Marines": "지바 롯데 마린스",
  "Lotte Marines": "지바 롯데 마린스",
  "Orix Buffaloes": "오릭스 버팔로스",
  "Tohoku Rakuten Golden Eagles": "도호쿠 라쿠텐 골든이글스",
  "Rakuten Eagles": "도호쿠 라쿠텐 골든이글스",
  "Saitama Seibu Lions": "사이타마 세이부 라이온스",
  "Seibu Lions": "사이타마 세이부 라이온스",
};
const TEAM_NAME_KO_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(TEAM_NAME_KO).map(([k, v]) => [k.toLowerCase(), v]),
);
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

function mapStatus(short: string): MatchStatus {
  const s = (short ?? "").toUpperCase();
  if (s === "FT" || s === "AOT" || s === "CANC_FT") return "FINISHED";
  if (s === "POST" || s === "CANC") return "POSTPONED";
  if (s.startsWith("IN") || s === "LIVE" || s === "INPL" || s === "ITC") return "LIVE";
  return "SCHEDULED";
}

function normalize(g: ApiBaseballGame): NormalizedMatch {
  const homeScore = parseScore(g.scores?.home?.total ?? null);
  const awayScore = parseScore(g.scores?.away?.total ?? null);
  return {
    league: "NPB",
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
    status: mapStatus(g.status.short),
    startTime: new Date(g.date),
    raw: g,
  };
}

export const npbCollector: MatchCollector = {
  league: "NPB",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    if (!isApiBaseballEnabled()) return [];
    const season = getSeason(date);
    const games = await fetchGames({
      leagueId: NPB_API_BASEBALL_ID,
      season,
      date,
    });
    return games.map(normalize);
  },
};
