// 야구 올스타(이벤트) 팀·매치 판정 — 정규 리그 집계·표시에서 제외한다.
// 소스가 올스타전을 정규 리그(KBO/MLB/NPB)로 내려주는 탓에 파워랭킹·순위표에
// "Dream/Nanum"(KBO), "American/National All-Stars"(MLB), "Central/Pacific league"(NPB)
// 같은 가짜 팀이 섞였다. 수집 단계에서 거르고, 표시 단계에서도 한 번 더 막는다.

/** 소스가 주는 올스타 팀명 (정확 일치, 소문자 비교) */
const ALLSTAR_TEAM_NAMES = new Set([
  "dream", // KBO 올스타 — 드림
  "nanum", // KBO 올스타 — 나눔
  "central league", // NPB 올스타 — 센트럴
  "pacific league", // NPB 올스타 — 퍼시픽
]);

/** 팀명이 올스타(이벤트) 팀인가 */
export function isBaseballAllStarTeam(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  if (!n) return false;
  return ALLSTAR_TEAM_NAMES.has(n) || /all[-\s]?stars?\b/.test(n) || n.includes("올스타");
}

/** 양팀 중 하나라도 올스타 팀이면 올스타 매치 */
export function isBaseballAllStarMatch(m: {
  homeTeam?: { name?: string | null };
  awayTeam?: { name?: string | null };
}): boolean {
  return isBaseballAllStarTeam(m.homeTeam?.name) || isBaseballAllStarTeam(m.awayTeam?.name);
}

/**
 * 수집 차단 이전에 DB 에 만들어진 올스타 팀의 Team.id.
 * 이제 수집에서 걸러지므로 더 늘지 않는 고정 집합 — 기존 매치를 지우지 않고 표시에서만 제외한다.
 * 610804/610805 = KBO 드림·나눔, 609698/609699 = MLB National·American All-Stars,
 * 611095/611096 = NPB 센트럴·퍼시픽.
 */
export const BASEBALL_ALLSTAR_TEAM_ID_LIST: readonly number[] = [
  610804, 610805, 609698, 609699, 611095, 611096,
];

export const BASEBALL_ALLSTAR_TEAM_IDS: ReadonlySet<number> = new Set(BASEBALL_ALLSTAR_TEAM_ID_LIST);

/** 매치 한 건이 올스타전인가 (팀 id 기준 — 매치 목록 필터용) */
export function isAllStarMatchRow(m: { homeTeamId: number; awayTeamId: number }): boolean {
  return BASEBALL_ALLSTAR_TEAM_IDS.has(m.homeTeamId) || BASEBALL_ALLSTAR_TEAM_IDS.has(m.awayTeamId);
}
