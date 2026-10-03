// 시즌 예측(/predictions/[league]) 지원 리그 단일 정의 — 예측 페이지 VALID 를 옮겨 왔다.
// 리그 허브(/leagues/[league]) 가 "예측 탭·CTA 를 열 리그" 를 같은 목록으로 판정하고, 시뮬 캐시 로더가 강등 팀 수를 여기서 읽는다.
export const PREDICTION_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "NBA", "NHL", "MLB", "KBO", "NPB", "LOL",
  // 2026-10-03 — KBL 과거 6시즌 백필로 Elo 이력 확보. 우승은 플레이오프라 아래 REGULAR_SEASON_TITLE_LEAGUES 에도.
  "KBL",
  // 2026-09-30 — 시즌 전체 일정(750경기, ts match/season) 수집 후 개방. 그 전엔 125/748 로 잘린 일정이었다.
  "KHL",
  // 2026-05-17 — 한국·아시아 5개 리그 추가 (DB 50건+)
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL",
  "WNBA", // 2026-05-21 — 미국 여자 농구
  "UEL", "UECL", // 2026-05-21 — UEFA 유로파·컨퍼런스
  // 2026-09-25 — 정식 리그 페이지에 예측 탭이 없던 유럽·아시아·남미 1·2부 14개(전수 실측). 공용 시뮬(getLeagueSeasonSim) 그대로.
  //  강등 팀 수는 리그·시즌마다 달라 확인 전엔 넣지 않는다(RELEGATION_COUNT 미정의 = 강등 확률 비표시).
  //  리가 MX 는 아페르투라·클라우수라가 한 시즌 창에 섞여 제외.
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL", "SAUDI_PL", "BRASILEIRAO", "CSL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
] as const;
export type PredictionLeague = (typeof PREDICTION_LEAGUES)[number];
export const PREDICTION_LEAGUE_SET: ReadonlySet<string> = new Set(PREDICTION_LEAGUES);

/** 강등(하위) 팀 수 — 예측 페이지 LEAGUE_INFO 와 같은 값. 미정의 = 0(강등 없음). */
export const RELEGATION_COUNT: Record<string, number> = {
  EPL: 3, LALIGA: 3, BUNDESLIGA: 3, SERIE_A: 3, LIGUE_1: 2, J1_LEAGUE: 3, J2_LEAGUE: 2, K_LEAGUE_1: 1,
};
export const relegationCountOf = (league: string) => RELEGATION_COUNT[league] ?? 0;

/** 리그 1위가 곧 우승이 아닌 리그 — 플레이오프로 우승을 가린다. 화면은 "정규리그 1위"라고 부른다. */
// NHL(2026-09-30) — 우승은 스탠리컵 플레이오프. 정규시즌 시뮬 1위를 "우승 확률"로 부르고 있었다.
// MLB·NBA·KBO·NPB(2026-09-30) — 같은 이유. MLB 예측 탭이 포스트시즌 중에 "우승 확률 밀워키 99.9%"(= 정규시즌 1위)를 띄웠다.
//   진짜 우승 확률은 MLB 포스트시즌 확률판(mlbAdvancementOdds)이 따로 낸다.
export const REGULAR_SEASON_TITLE_LEAGUES: ReadonlySet<string> = new Set(["MLS", "JUPILER_PL", "GREEK_SL", "KHL", "NHL", "MLB", "NBA", "KBO", "NPB", "KBL"]);

/**
 * 경기별 AI 승률을 내지 않는 리그 — 백테스트가 50:50 찍기보다 못했다.
 * WKBL(2026-10-03): 과거 6시즌 백필 후 2024-25·2025-26 검증 Brier .2667(찍기 .25), 홈 이점 0·Platt 보정을 해도 .255 이상.
 *  6팀·시즌 90경기에 비시즌 이동이 커 Elo 가 맞지 않는다. 시즌 중 이번 시즌 성적만으로 재검증하기 전까지 비공개.
 */
export const NO_PREDICTION_LEAGUES: ReadonlySet<string> = new Set(["WKBL"]);
