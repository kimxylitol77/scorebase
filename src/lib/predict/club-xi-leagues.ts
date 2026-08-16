// 클럽 예상 라인업 지원 리그 — 단일 정의 (build-club-predicted-xi 빌더 + 라이브 페이지 공용).
// 리그 추가는 여기만 바꾸면 빌더·노출이 함께 따라온다.

export const CLUB_XI_LEAGUES = new Set<string>([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "K_LEAGUE_1",
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
