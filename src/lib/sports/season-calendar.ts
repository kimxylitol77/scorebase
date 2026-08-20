// 리그의 "시즌 모양"(달력연도 vs 유럽형 8~5월 vs 고정 연도 대회) 단일 정의.
//
// 왜 별도 파일인가.
//   기존엔 같은 지식이 두 곳(standings-collect 의 seasonFor, api-football-collector 의
//   seasonFor)에 각각 하드코딩돼 리그를 추가할 때마다 양쪽을 손으로 맞춰야 했다.
//   여기는 "리그의 고정 정보" 계층 — 매년 바뀌는 시즌 ID/연도는 CompetitionSeason
//   레지스트리(season-registry.ts)가 정본이고, 이 파일은 레지스트리가 비었을 때의
//   제한적 fallback 계산만 담당한다.
//
// 우선순위: CompetitionSeason(ACTIVE).seasonYear  →  computeSeasonYear() (이 파일)

/** 시즌 경계 모양. */
export type SeasonShape =
  /** 유럽형 — 7월에 새 시즌 시작, season 표기는 시작 연도 (2026-27 → 2026) */
  | { kind: "SPLIT_YEAR"; startMonth: number }
  /** 달력 연도 — 3월 개막·11월 종료 등 (K리그·J리그·MLS·브라질 등) */
  | { kind: "CALENDAR" }
  /** 단발 토너먼트 — 대회 연도 고정 (월드컵·올림픽 등) */
  | { kind: "FIXED"; year: number };

const SPLIT_YEAR: SeasonShape = { kind: "SPLIT_YEAR", startMonth: 7 };
const CALENDAR: SeasonShape = { kind: "CALENDAR" };
const fixed = (year: number): SeasonShape => ({ kind: "FIXED", year });

/**
 * 유럽형(7월 경계) 리그 목록.
 * 출처: standings-collect / api-football-collector 두 곳에 있던 `european` 배열의 합집합.
 * 두 곳의 계산 결과를 바꾸지 않는 것이 이 목록의 계약이다 — 추가/삭제는 실측 후에만.
 */
const SPLIT_YEAR_LEAGUES = [
  // Top5 + 2부
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  // 유럽 대항전
  "UCL", "UEL", "UECL", "UEFA_WCL", "UEFA_NL", "EURO_QUAL",
  // 유럽 기타 1부
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "EKSTRAKLASA", "POLAND_1L", "BULGARIA_PL", "LIGA_I", "SWISS_SL", "CHALLENGE_LEAGUE",
  "ARMENIA_PL", "AUSTRIA_BL", "CZECH_L", "HNL", "UKRAINE_PL", "HUNGARY_NB1",
  "SERBIA_SL", "SLOVAKIA_SL", "SLOVENIA_SNL", "CYPRUS_1D", "DENMARK_SL",
  "BOSNIA_PL", "ALBANIA_SL", "MOLDOVA_SL", "AZERBAIJAN_PL",
  // 유럽 하부
  "LEAGUE_ONE", "LEAGUE_TWO", "NATIONAL_LEAGUE",
  "SCOT_CHAMPIONSHIP", "SCOT_LEAGUE_ONE", "SCOT_LEAGUE_TWO",
  "EREDIVISIE_2", "PRIMEIRA_LIGA_2", "SUI_CUP",
  // 아시아·중동·아프리카 (8~5월)
  "SAUDI_PL", "EGYPT_PL", "ISRAEL_PL", "INDIA_ISL", "INDONESIA_L1",
  "UAE_PL", "QATAR_SL", "MOROCCO_BP", "SOUTHAFRICA_PSL", "THAI_L1",
  "AFC_CL", "AFC_CL_TWO",
  // 기타
  "SINGAPORE_PL", "A_LEAGUE", "A_LEAGUE_W", "LIGA_MX", "WSL",
  "RPL", "ALGERIA_L1", "GHANA_PL",
  // 2026-07-31 시즌 레지스트리 도입 시 추가 — 유럽 2부 (순위 소스 없음으로 보고된 리그들)
  "CZECH_2", "DENMARK_2", "AUSTRIA_2", "HUNGARY_2", "TURKEY_2", "BELGIUM_2",
  // 2026-08-09 실측 추가 — af season=2025 응답이 25-26 풀시즌(32·36·30경기)이고 8월에 새 시즌
  //  개막(played 1~2) 확인. 달력형 오분류로 라벨이 "2025" 로 찍히던 것 교정 (아카이브 relabel 완료).
  //  SEASON_BOUNDARY 도 셋 다 6/15 여름 경계라 팀 페이지 시즌 창과 정합.
  "WALES_PL", "MONTENEGRO_1L", "LUXEMBOURG_ND",
] as const;

/**
 * 단발/주기 토너먼트의 고정 시즌 연도.
 * ⚠ 대회가 끝나면 다음 대회 연도로 갱신해야 하는 값 — 장기적으로는 CompetitionSeason
 *    레지스트리가 이 표를 대체한다(레지스트리에 ACTIVE 가 있으면 이 값은 안 읽힌다).
 */
const FIXED_YEAR_LEAGUES: Record<string, number> = {
  WORLD_CUP: 2026,
  WC_QUAL: 2026,
  CLUB_WORLD_CUP: 2025,
  AFC_U23: 2025,
  ASEAN_CHAMP: 2025,
  AFCON: 2025,
  CONCACAF_GOLD: 2025,
  U20_WC: 2025,
  U17_WC: 2025,
  UEFA_U21_Q: 2025,
  UEFA_U21: 2025,
  UEFA_U19: 2025,
  UEFA_U17: 2025,
  OLYMPICS_FOOTBALL: 2024,
};

const SHAPE_BY_LEAGUE: Map<string, SeasonShape> = (() => {
  const m = new Map<string, SeasonShape>();
  for (const l of SPLIT_YEAR_LEAGUES) m.set(l, SPLIT_YEAR);
  for (const [l, y] of Object.entries(FIXED_YEAR_LEAGUES)) m.set(l, fixed(y));
  return m;
})();

/** 리그의 시즌 모양. 미등록 리그는 달력 연도(K리그·MLS·브라질 등 기본값). */
export function seasonShapeFor(league: string): SeasonShape {
  return SHAPE_BY_LEAGUE.get(league) ?? CALENDAR;
}

/** 유럽형(7월 경계) 리그인지 — 개막 전 판정·감시 주기 계산에 사용. */
export function isSplitYearLeague(league: string): boolean {
  return seasonShapeFor(league).kind === "SPLIT_YEAR";
}

/**
 * 레지스트리가 없을 때의 fallback 시즌 연도 계산.
 * api-football 의 `season` 파라미터와 같은 표기(유럽형 = 시작 연도).
 *
 * @param at 기준 시각 (UTC 기준으로 연·월 해석 — 기존 standings-collect 와 동일)
 */
export function computeSeasonYear(league: string, at: Date = new Date()): number {
  const shape = seasonShapeFor(league);
  if (shape.kind === "FIXED") return shape.year;
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth() + 1;
  if (shape.kind === "SPLIT_YEAR") {
    return month >= shape.startMonth ? year : year - 1;
  }
  return year;
}

/** "2026-27"(유럽형) / "2026"(달력·단발) 표기. */
export function seasonLabelFor(league: string, seasonYear: number): string {
  if (seasonShapeFor(league).kind === "SPLIT_YEAR") {
    return `${seasonYear}-${String((seasonYear + 1) % 100).padStart(2, "0")}`;
  }
  return String(seasonYear);
}

/** 순위표를 요구하지 않는 리그 — 친선은 표 자체가 없다. */
export const NO_STANDINGS_LEAGUES = new Set(["CLUB_FRIENDLY", "INTL_FRIENDLY"]);

/** 단계(예선·리그페이즈·녹아웃)로 나뉘어 단일 순위표로 판정할 수 없는 대회. */
export const STAGED_COMPETITIONS = new Set([
  "UCL", "UEL", "UECL", "UEFA_WCL",
  "AFC_CL", "AFC_CL_TWO", "COPA_LIB", "COPA_SUD",
  "WORLD_CUP", "CLUB_WORLD_CUP", "AFCON", "CONCACAF_GOLD",
  "FA_CUP", "EFL_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
  "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "LEVAIN_CUP",
  "SUI_CUP", "SVENSKA_CUPEN", "SCO_LEAGUE_CUP", "CONCACAF_CCUP", "AFC_CUP",
  // 2026-08-20 추가 — 컵인데 LEAGUE 로 분류돼 컵 예외를 못 받고 있었다. 순위표가 없는 게
  // 정상인데 감시가 "ACTIVE 인데 캐시 없음" HIGH 로 읽었다(COPA_DO_BRASIL 실측).
  "COPA_DO_BRASIL", "LEAGUES_CUP", "PORTUGAL_SUPER_CUP",
]);
