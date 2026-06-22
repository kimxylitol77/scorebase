// 드림팀 레이팅(Elo) 갱신 + 경기 보상 포인트(이적 자금)

export function updateRating(myRating: number, oppElo: number, outcome: "win" | "draw" | "loss"): number {
  const K = 32;
  const expected = 1 / (1 + Math.pow(10, (oppElo - myRating) / 400));
  const actual = outcome === "win" ? 1 : outcome === "draw" ? 0.5 : 0;
  return Math.round(myRating + K * (actual - expected));
}

// 경기 보상 — 이적 자금(€M). 승리할수록 더 많이 모아 상위 티어 예산을 해금.
export function matchReward(outcome: "win" | "draw" | "loss"): number {
  return outcome === "win" ? 5 : outcome === "draw" ? 2 : 1;
}
