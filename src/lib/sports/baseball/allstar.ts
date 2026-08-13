// 야구 올스타(이벤트) 팀 판정 — 순위표·파워랭킹·시즌 시뮬에서만 제외한다.
// 소스가 올스타전을 정규 리그(KBO/MLB/NPB)로 내려줘 "Dream/Nanum"(KBO),
// "American/National All-Stars"(MLB), "Central/Pacific league"(NPB) 가 정규팀처럼 섞였다.
// 수집·라이브 스코어·일정에는 그대로 둔다 (실제로 열리는 경기라 스코어는 봐야 함).

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

/**
 * 올스타 팀의 Team.id. 소스 팀 id 가 매년 같아 우리 Team row 도 재사용되므로 고정 집합.
 * 610804/610805 = KBO 드림·나눔, 609698/609699 = MLB National·American All-Stars,
 * 611095/611096 = NPB 센트럴·퍼시픽.
 */
export const BASEBALL_ALLSTAR_TEAM_ID_LIST: readonly number[] = [
  610804, 610805, 609698, 609699, 611095, 611096,
];

export const BASEBALL_ALLSTAR_TEAM_IDS: ReadonlySet<number> = new Set(BASEBALL_ALLSTAR_TEAM_ID_LIST);

/** 매치 한 건이 올스타전인가 (팀 id 기준 — 순위·전력 집계에서 빼는 용도) */
export function isAllStarMatchRow(m: { homeTeamId: number; awayTeamId: number }): boolean {
  return BASEBALL_ALLSTAR_TEAM_IDS.has(m.homeTeamId) || BASEBALL_ALLSTAR_TEAM_IDS.has(m.awayTeamId);
}

/**
 * 매치 목록에서 올스타전을 걷어낸다. 야구 id 고정 집합이라 축구·농구 리그에는 no-op.
 * 호출부마다 filter 를 손으로 붙이다 빠뜨리는 일이 반복돼(시즌 시뮬 5곳) 공용 헬퍼로 뺐다.
 */
export function stripBaseballAllStarMatches<T extends { homeTeamId: number; awayTeamId: number }>(
  rows: readonly T[],
): T[] {
  return rows.filter((m) => !isAllStarMatchRow(m));
}
