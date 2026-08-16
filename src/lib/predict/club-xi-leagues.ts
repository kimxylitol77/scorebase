// 클럽 예상 라인업 지원 리그 — 단일 정의 (build-club-predicted-xi 빌더 + 라이브 페이지 공용).
// 리그 추가는 여기만 바꾸면 빌더·노출이 함께 따라온다.

export const CLUB_XI_LEAGUES = new Set<string>([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "K_LEAGUE_1",
  // 2026-08-17 확장 — 라인업 커버 좋은 주요 리그 19개 (사용자 승인 25개 체제).
  // 기준: 최근 30일 확정 라인업 적재율 + 노출 가치. 빌더 재료(확정 XI 2경기+)가
  // 부족한 팀은 품질 가드가 알아서 거르므로 리그 추가 자체는 안전하다.
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SPL", "JUPILER_PL",
  "UCL", "UEL",
  "J1_LEAGUE", "J2_LEAGUE", "K_LEAGUE_2",
  "MLS", "BRASILEIRAO", "LIGA_MX", "SAUDI_PL",
]);

const normTeam = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");

/**
 * 팀명 매칭 — 정규화 일치 또는 한쪽 포함 ("Deportivo" ↔ "Deportivo La Coruna").
 * InjurySnapshot.teamId 가 전부 null (수집기 미채움, 2026-08-16 실측)이라
 * 부상 결합은 이 팀명 매칭이 유일한 join 경로다 (빌더·라이브 페이지 공용).
 */
export function teamNameMatches(a: string, b: string): boolean {
  const na = normTeam(a);
  const nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [s, l] = na.length <= nb.length ? [na, nb] : [nb, na];
  return s.length >= 5 && l.includes(s);
}
