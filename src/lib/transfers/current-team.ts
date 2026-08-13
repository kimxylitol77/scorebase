// 선수의 "현재 소속 팀" 해석 — 공식 스쿼드(ts team/squad/list) 를 정본으로 쓴다.
//
// 왜. PlayerMarketValue.teamId 는 시장가치 스냅샷이 찍힌 시점의 소속이라 이적창 이동을
// 따라가지 못한다(증분 피드가 하루 1~3건이라 사실상 정지). 그대로 쓰면 이적시장 뷰가
// 몇 달 전 명단을 보여준다. data/team-squads.json(scripts/build-team-squads.ts) 은
// 팀 단위 공식 명단이라 이적 결과가 그대로 반영된다.

import rawSquads from "../../../data/team-squads.json";

const SQUADS = rawSquads as Record<string, { updatedAt: string; squad: Array<{ id: string }> }>;

// ts playerId → ts teamId (공식 명단 역인덱스)
const PLAYER_TEAM = new Map<string, string>();
for (const [tsTeamId, t] of Object.entries(SQUADS)) {
  for (const s of t.squad) PLAYER_TEAM.set(s.id, tsTeamId);
}

/**
 * 현재 소속 ts 팀 id. null = 커버 리그 소속 아님(방출·비커버 리그 이적) → 랭킹에서 제외.
 *
 * ① 공식 명단에 있으면 그 팀.
 * ② 없는데 PMV 소속 팀의 명단은 수집돼 있다 → 그 팀에서 빠진 것이므로 소속 없음.
 * ③ 그 팀 명단 자체가 없으면(비커버·수집 실패) 판단 불가 → PMV 값 유지.
 */
export function currentTsTeamId(playerId: string, pmvTeamId: string | null | undefined): string | null {
  const inSquad = PLAYER_TEAM.get(playerId);
  if (inSquad) return inSquad;
  if (pmvTeamId && SQUADS[pmvTeamId]) return null;
  return pmvTeamId ?? null;
}

/** 주어진 ts 팀들의 공식 명단 선수 id (PMV 소속이 낡아도 새 영입을 후보에 넣기 위한 것) */
export function squadPlayerIds(tsTeamIds: Iterable<string>): string[] {
  // 한 팀에 ts id 가 여러 개 매핑된 경우가 있어 중복 제거 — 그대로 IN 에 넣으면 파라미터가 배로 는다.
  const out = new Set<string>();
  for (const tid of tsTeamIds) {
    for (const s of SQUADS[tid]?.squad ?? []) out.add(s.id);
  }
  return [...out];
}

/** 공식 명단이 수집된 ts 팀 id 목록 */
export function squadTeamIds(): string[] {
  return Object.keys(SQUADS);
}
