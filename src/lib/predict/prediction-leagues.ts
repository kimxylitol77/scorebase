// 시즌 예측(/predictions/[league]) 지원 리그 단일 정의 — 예측 페이지 VALID 를 옮겨 왔다.
// 리그 허브(/leagues/[league]) 가 "예측 탭·CTA 를 열 리그" 를 같은 목록으로 판정하고, 시뮬 캐시 로더가 강등 팀 수를 여기서 읽는다.
export const PREDICTION_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "NBA", "NHL", "MLB", "KBO", "NPB", "LOL",
  // 2026-05-17 — 한국·아시아 5개 리그 추가 (DB 50건+)
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL",
  "WNBA", // 2026-05-21 — 미국 여자 농구
  "UEL", "UECL", // 2026-05-21 — UEFA 유로파·컨퍼런스
] as const;
export type PredictionLeague = (typeof PREDICTION_LEAGUES)[number];
export const PREDICTION_LEAGUE_SET: ReadonlySet<string> = new Set(PREDICTION_LEAGUES);

/** 강등(하위) 팀 수 — 예측 페이지 LEAGUE_INFO 와 같은 값. 미정의 = 0(강등 없음). */
export const RELEGATION_COUNT: Record<string, number> = {
  EPL: 3, LALIGA: 3, BUNDESLIGA: 3, SERIE_A: 3, LIGUE_1: 2, J1_LEAGUE: 3, J2_LEAGUE: 2, K_LEAGUE_1: 1,
};
export const relegationCountOf = (league: string) => RELEGATION_COUNT[league] ?? 0;
