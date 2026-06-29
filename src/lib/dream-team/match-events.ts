// 드림팀 경기 이벤트 — 최종 스코어를 90분 타임라인(골·위협 기회)으로 펼쳐 라이브 중계에 쓴다. 게임 전용.
export interface MatchEvent {
  minute: number;
  team: "my" | "opp";
  type: "goal" | "chance"; // goal=득점, chance=위협(노골 기회)
}

// 결정적 RNG(seed) — 같은 경기는 같은 타임라인
export function generateMatchEvents(myScore: number, oppScore: number, seed: number): MatchEvent[] {
  let s = (seed >>> 0) || 1;
  const rand = () => {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const events: MatchEvent[] = [];
  const addGoals = (n: number, team: "my" | "opp") => {
    for (let i = 0; i < n; i++) events.push({ minute: 1 + Math.floor(rand() * 90), team, type: "goal" });
  };
  addGoals(myScore, "my");
  addGoals(oppScore, "opp");
  // 위협(노골 기회) 2~5개 — 0-0 도 밋밋하지 않게 긴장감
  const chances = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < chances; i++) {
    events.push({ minute: 1 + Math.floor(rand() * 90), team: rand() < 0.5 ? "my" : "opp", type: "chance" });
  }
  return events.sort((a, b) => a.minute - b.minute);
}
