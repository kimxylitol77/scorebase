// 드림팀 선수 육성 — 경기 출전 xp 누적 → OVR 성장 (나이 잠재력 상한)

// 현재 OVR = 기본 OVR + 육성 레벨, 단 potential 을 넘지 못함.
export function grownOvr(baseOvr: number, potential: number, xp: number): number {
  const levels = Math.floor((xp || 0) / 100); // xp 100당 +1
  return Math.min(potential, baseOvr + levels);
}

// 경기 1회 출전 시 획득 xp (승리할수록 많이)
export function matchXp(outcome: "win" | "draw" | "loss"): number {
  return outcome === "win" ? 20 : outcome === "draw" ? 12 : 8;
}
