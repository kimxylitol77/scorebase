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
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "AFC_CL",
  "KBO", "NPB", "MLB",
  "NBA", "NHL", "LOL",
];

export const SPORTS: SportMeta[] = [
  {
    code: "soccer",
    label: "축구",
    emoji: "⚽",
    leagues: [
      "K_LEAGUE_1", "K_LEAGUE_2", "AFC_CL",
      "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "MLS",
      "J1_LEAGUE", "WORLD_CUP",
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
  AFC_CL: "AFC 챔피언스리그",
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
  EPL: 10,
  UCL: 11,
  LALIGA: 12,
  BUNDESLIGA: 13,
  SERIE_A: 14,
  LIGUE_1: 15,
  MLS: 16,
  J1_LEAGUE: 17,
  WORLD_CUP: 18,
  NBA: 20,
  NHL: 21,
  LOL: 30,
};
