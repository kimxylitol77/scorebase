// /players/[pid] 축구 뷰가 지원하는 리그 — 단일 출처.
//
// 같은 목록이 페이지 안에 두 번(metadata·본문), 리더보드 링크 판정에 또 한 번 있었다.
// 한쪽만 늘리면 링크는 걸리는데 페이지는 MLB 분기로 떨어져 404 가 난다.

export const SOCCER_PLAYER_PAGE_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE",
  "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL", "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD", "CSL", "A_LEAGUE", "CLUB_WORLD_CUP",
];

export const SOCCER_PLAYER_PAGE_LEAGUE_SET = new Set(SOCCER_PLAYER_PAGE_LEAGUES);

/**
 * api-football 선수 프로필을 조회할 시즌 후보 — 최신부터.
 *
 * 단일 시즌만 조회하면 시즌 경계에서 통째로 404 가 난다. 2026-08-01 실측: 유럽 하위 리그
 * 선수는 season=2026(2026-27) 응답이 0건이고 season=2025 는 정상이었다. 새 시즌이 아직
 * 데이터를 못 채운 것뿐인데 페이지는 "선수 없음" 으로 떨어졌다.
 * 캘린더제 리그(J리그·중국·남미)는 첫 후보에서 바로 맞으므로 추가 호출이 없다.
 */
export function soccerProfileSeasons(now: Date): number[] {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const current = m >= 7 ? y : y - 1;
  return [current, current - 1];
}
