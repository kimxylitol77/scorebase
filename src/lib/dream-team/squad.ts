// 드림팀 보유 스쿼드·선발 라인업 유틸 (게임 전용) — squad=보유, lineup=선발 11명
export interface SquadMember {
  playerId: string;
  xp: number;
  role: string;
  boughtValue?: number; // 영입 시 시세(€M) — 방출 손익 계산용. 없으면 기본 몸값으로 폴백
  condition?: number; // 컨디션 0~100 (없으면 100). 출전 소모·휴식 회복
  injuryGames?: number; // 남은 부상 결장 경기 수 (없으면 0)
}
export interface LineupSlot {
  slot: string;
  playerId: string;
}

export interface LineupMember {
  slot: string;
  playerId: string;
  xp: number;
  role: string;
  condition: number;
  injuryGames: number;
}

// 선발 라인업을 경기용 선수 배열로 — lineup 의 playerId 를 squad 에서 조회해 xp·role·상태를 결합.
// (보유에 없는 선수는 제외 — 방출된 선수가 라인업에 남는 불일치 방어)
export function lineupMembers(squad: SquadMember[], lineup: LineupSlot[]): LineupMember[] {
  const byId = new Map(squad.map((s) => [s.playerId, s]));
  return lineup.flatMap((l) => {
    const s = byId.get(l.playerId);
    return s ? [{ slot: l.slot, playerId: l.playerId, xp: s.xp, role: s.role, condition: s.condition ?? 100, injuryGames: s.injuryGames ?? 0 }] : [];
  });
}

// 컨디션 페널티 — 70 미만이면 OVR 을 깎는다(40 컨디션 ≈ −4). 로테이션을 안 하면 약해짐.
export function conditionPenalty(condition: number): number {
  return condition < 70 ? Math.round((70 - condition) * 0.12) : 0;
}

// 출전 선수(선발 라인업)에게 xp 부여 → 갱신된 squad 반환 (벤치는 성장 없음). 유저 대전용(상태 미변동).
export function awardXp(squad: SquadMember[], lineup: LineupSlot[], xp: number): SquadMember[] {
  const ids = new Set(lineup.map((l) => l.playerId));
  return squad.map((s) => (ids.has(s.playerId) ? { ...s, xp: s.xp + xp } : s));
}

// 시즌 경기 후 squad 갱신 — 선발은 xp+·컨디션↓·부상 확률, 벤치는 컨디션 회복·부상 카운트↓.
export function applyMatchEffects(squad: SquadMember[], lineup: LineupSlot[], xpGain: number, seed: number): SquadMember[] {
  const ids = new Set(lineup.map((l) => l.playerId));
  let s = (seed >>> 0) || 1;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  return squad.map((m) => {
    const cond = m.condition ?? 100;
    const inj = m.injuryGames ?? 0;
    if (ids.has(m.playerId)) {
      const injured = inj === 0 && rand() < 0.02;
      return { ...m, xp: m.xp + xpGain, condition: Math.max(0, cond - 20), injuryGames: injured ? 1 + Math.floor(rand() * 2) : inj };
    }
    return { ...m, condition: Math.min(100, cond + 40), injuryGames: Math.max(0, inj - 1) };
  });
}
