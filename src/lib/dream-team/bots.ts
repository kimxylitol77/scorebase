// 드림팀 봇 상대팀 — 티어별 고정. avgOvr 만 시뮬에 쓰이고 나머지는 표시용.

export interface BotTeam {
  id: string;
  name: string;
  tier: string;
  avgOvr: number;
  mentality: string; // 전술 성향 — 상대 성향을 보고 대응 전술을 고르는 메타
}

// 아마추어 티어 봇 5팀 (난이도 = avgOvr). 내 €15M 팀 평균 OVR(~60)과 비등~약우세.
export const BOT_TEAMS: BotTeam[] = [
  { id: "bot-amateur-1", name: "동네 강호", tier: "amateur", avgOvr: 68, mentality: "balanced" },
  { id: "bot-amateur-2", name: "지역 클럽", tier: "amateur", avgOvr: 74, mentality: "attack" },
  { id: "bot-amateur-3", name: "세미프로 도전자", tier: "amateur", avgOvr: 80, mentality: "defend" },
  { id: "bot-amateur-4", name: "2부 리그 강호", tier: "amateur", avgOvr: 85, mentality: "ultra_defend" },
  { id: "bot-amateur-5", name: "프로 워너비", tier: "amateur", avgOvr: 90, mentality: "ultra_attack" },
];

export function botsForTier(tier: string): BotTeam[] {
  return BOT_TEAMS.filter((b) => b.tier === tier);
}
