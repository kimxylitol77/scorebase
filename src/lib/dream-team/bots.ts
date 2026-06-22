// 드림팀 봇 상대팀 — 티어별 고정. avgOvr 만 시뮬에 쓰이고 나머지는 표시용.

export interface BotTeam {
  id: string;
  name: string;
  tier: string;
  avgOvr: number;
}

// 아마추어 티어 봇 5팀 (난이도 = avgOvr). 내 €15M 팀 평균 OVR(~60)과 비등~약우세.
export const BOT_TEAMS: BotTeam[] = [
  { id: "bot-amateur-1", name: "동네 조기축구회", tier: "amateur", avgOvr: 56 },
  { id: "bot-amateur-2", name: "공원 FC", tier: "amateur", avgOvr: 60 },
  { id: "bot-amateur-3", name: "직장인 유나이티드", tier: "amateur", avgOvr: 64 },
  { id: "bot-amateur-4", name: "대학 동아리 SC", tier: "amateur", avgOvr: 68 },
  { id: "bot-amateur-5", name: "세미프로 도전자", tier: "amateur", avgOvr: 72 },
];

export function botsForTier(tier: string): BotTeam[] {
  return BOT_TEAMS.filter((b) => b.tier === tier);
}
