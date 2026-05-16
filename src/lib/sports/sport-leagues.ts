// 종목(sport) ↔ 리그(league) 매핑 + 한글 라벨.
// /scores 페이지 종목 탭에서 사용.

export type SportCode = "all" | "soccer" | "baseball" | "basketball" | "hockey" | "esports";

interface SportMeta {
  code: SportCode;
  label: string;
  emoji: string;
  leagues: string[]; // 우리 League 코드 (대문자)
}

// 모든 리그 묶음 — `all` 처리용 (URL 호환성, sportTab 노출 X)
const ALL_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "LIGA_MX", "BRASILEIRAO", "COPA_LIB", "COPA_SUD",
  "CSL", "A_LEAGUE",
  "CLUB_WORLD_CUP",
  "KBO", "NPB", "MLB",
  "NBA", "NHL", "LOL",
];

export const SPORTS: SportMeta[] = [
  {
    code: "soccer",
    label: "축구",
    emoji: "⚽",
    leagues: [
      "K_LEAGUE_1", "K_LEAGUE_2", "AFC_CL", "AFC_CL_TWO", "AFC_U23",
      "J1_LEAGUE", "J2_LEAGUE",
      "UCL", "UEL", "UECL",
      "EPL", "CHAMPIONSHIP",
      "LALIGA", "LALIGA_2",
      "BUNDESLIGA", "BUNDESLIGA_2",
      "SERIE_A", "SERIE_B",
      "LIGUE_1", "LIGUE_2",
      "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
      "MLS", "LIGA_MX", "BRASILEIRAO", "COPA_LIB", "COPA_SUD",
      "CSL", "A_LEAGUE", "SAUDI_PL",
      "CLUB_WORLD_CUP", "WORLD_CUP",
    ],
  },
  {
    code: "baseball",
    label: "야구",
    emoji: "⚾",
    leagues: ["KBO", "NPB", "MLB"],
  },
  {
    code: "basketball",
    label: "농구",
    emoji: "🏀",
    leagues: ["NBA"],
  },
  {
    code: "hockey",
    label: "하키",
    emoji: "🏒",
    leagues: ["NHL"],
  },
  {
    code: "esports",
    label: "e스포츠",
    emoji: "🎮",
    leagues: ["LOL"],
  },
];

export function leaguesForSport(code: SportCode): string[] {
  if (code === "all") return ALL_LEAGUES;
  return SPORTS.find((s) => s.code === code)?.leagues ?? ALL_LEAGUES;
}

export const LEAGUE_DISPLAY: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵 2026",
  K_LEAGUE_1: "K리그 1",
  K_LEAGUE_2: "K리그 2",
  J1_LEAGUE: "J1 리그",
  J2_LEAGUE: "J2 리그",
  AFC_CL: "AFC 챔피언스리그",
  SAUDI_PL: "사우디 프로 리그",
  UEL: "유로파 리그",
  UECL: "유로파 컨퍼런스",
  CHAMPIONSHIP: "잉글랜드 챔피언십",
  LALIGA_2: "라리가 2",
  BUNDESLIGA_2: "분데스리가 2",
  SERIE_B: "세리에 B",
  LIGUE_2: "리그 2",
  CLUB_WORLD_CUP: "FIFA 클럽 월드컵",
  AFC_CL_TWO: "AFC 챔피언스리그 2",
  AFC_U23: "AFC U23 아시안컵",
  CSL: "중국 슈퍼리그",
  A_LEAGUE: "A-리그",
  EREDIVISIE: "에레디비시",
  PRIMEIRA_LIGA: "프리메이라 리가",
  SUPER_LIG: "쉬페르 리그",
  JUPILER_PL: "주피러 프로 리그",
  SPL: "스코틀랜드 프리미어십",
  GREEK_SL: "그리스 슈퍼리그",
  BRASILEIRAO: "브라질 세리에 A",
  LIGA_MX: "리가 MX",
  COPA_LIB: "코파 리베르타도레스",
  COPA_SUD: "코파 수다메리카나",
  KBO: "KBO 리그",
  NPB: "NPB 일본프로야구",
  MLB: "메이저리그",
  NBA: "NBA",
  NHL: "NHL",
  LOL: "LCK",
};

/** 정렬 우선순위 (낮을수록 위) — KBO/NPB 한국 시청자 우선 */
export const LEAGUE_ORDER: Record<string, number> = {
  KBO: 0,
  NPB: 1,
  MLB: 2,
  K_LEAGUE_1: 5,
  K_LEAGUE_2: 6,
  AFC_CL: 7,
  AFC_CL_TWO: 7.5,
  AFC_U23: 7.7,
  J1_LEAGUE: 8,
  J2_LEAGUE: 9,
  EPL: 10,
  CHAMPIONSHIP: 10.5,
  UCL: 11,
  UEL: 11.5,
  UECL: 11.7,
  LALIGA: 12,
  LALIGA_2: 12.5,
  BUNDESLIGA: 13,
  BUNDESLIGA_2: 13.5,
  SERIE_A: 14,
  SERIE_B: 14.5,
  LIGUE_1: 15,
  LIGUE_2: 15.5,
  EREDIVISIE: 15.6,
  PRIMEIRA_LIGA: 15.65,
  SUPER_LIG: 15.7,
  JUPILER_PL: 15.75,
  SPL: 15.8,
  GREEK_SL: 15.85,
  MLS: 16,
  LIGA_MX: 16.1,
  BRASILEIRAO: 16.2,
  COPA_LIB: 16.3,
  COPA_SUD: 16.35,
  CSL: 16.4,
  A_LEAGUE: 16.45,
  SAUDI_PL: 16.5,
  CLUB_WORLD_CUP: 17,
  WORLD_CUP: 18,
  NBA: 20,
  NHL: 21,
  LOL: 30,
};
