// 드림팀 보유 스쿼드·선발 라인업 유틸 (게임 전용) — squad=보유, lineup=선발 11명
export interface SquadMember {
  playerId: string;
  xp: number;
  role: string;
  boughtValue?: number; // 영입 시 시세(€M) — 방출 손익 계산용. 없으면 기본 몸값으로 폴백
}
export interface LineupSlot {
  slot: string;
  playerId: string;
}

// 선발 라인업을 경기용 선수 배열로 — lineup 의 playerId 를 squad 에서 조회해 xp·role 을 결합.
// (보유에 없는 선수는 제외 — 방출된 선수가 라인업에 남는 불일치 방어)
export function lineupMembers(squad: SquadMember[], lineup: LineupSlot[]): { slot: string; playerId: string; xp: number; role: string }[] {
  const byId = new Map(squad.map((s) => [s.playerId, s]));
  return lineup.flatMap((l) => {
    const s = byId.get(l.playerId);
    return s ? [{ slot: l.slot, playerId: l.playerId, xp: s.xp, role: s.role }] : [];
  });
}

// 출전 선수(선발 라인업)에게 xp 부여 → 갱신된 squad 반환 (벤치는 성장 없음)
export function awardXp(squad: SquadMember[], lineup: LineupSlot[], xp: number): SquadMember[] {
  const ids = new Set(lineup.map((l) => l.playerId));
  return squad.map((s) => (ids.has(s.playerId) ? { ...s, xp: s.xp + xp } : s));
}
