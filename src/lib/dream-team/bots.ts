// 드림팀 봇 상대팀 — 티어별 고정. avgOvr 만 시뮬에 쓰이고 나머지는 표시용.

export interface BotTeam {
  id: string;
  name: string;
  tier: string;
  avgOvr: number;
  mentality: string; // 전술 성향 — 상대 성향을 보고 대응 전술을 고르는 메타
}

// 티어별 봇 5팀씩 (난이도 = avgOvr). 티어 예산이 오를수록 봇 OVR 도 비례 상향.
// 멘탈리티는 각 티어 5팀에 동일 패턴(균형·공격·수비·초수비·초공격)으로 분배 → 상성 메타.
export const BOT_TEAMS: BotTeam[] = [
  // 아마추어 (€15M) — 내 시작 팀(~60)과 비등~약우세
  { id: "bot-amateur-1", name: "동네 강호", tier: "amateur", avgOvr: 68, mentality: "balanced" },
  { id: "bot-amateur-2", name: "지역 클럽", tier: "amateur", avgOvr: 74, mentality: "attack" },
  { id: "bot-amateur-3", name: "세미프로 도전자", tier: "amateur", avgOvr: 80, mentality: "defend" },
  { id: "bot-amateur-4", name: "2부 리그 강호", tier: "amateur", avgOvr: 85, mentality: "ultra_defend" },
  { id: "bot-amateur-5", name: "프로 워너비", tier: "amateur", avgOvr: 90, mentality: "ultra_attack" },
  // 동네축구 (€40M)
  { id: "bot-local-1", name: "조기축구 클럽", tier: "local", avgOvr: 74, mentality: "balanced" },
  { id: "bot-local-2", name: "시민 구단", tier: "local", avgOvr: 79, mentality: "attack" },
  { id: "bot-local-3", name: "도전자 FC", tier: "local", avgOvr: 84, mentality: "defend" },
  { id: "bot-local-4", name: "지역 맹주", tier: "local", avgOvr: 88, mentality: "ultra_defend" },
  { id: "bot-local-5", name: "승격 후보", tier: "local", avgOvr: 91, mentality: "ultra_attack" },
  // 유소년 (€80M)
  { id: "bot-youth-1", name: "유스 아카데미", tier: "youth", avgOvr: 80, mentality: "balanced" },
  { id: "bot-youth-2", name: "클럽 유망주", tier: "youth", avgOvr: 84, mentality: "attack" },
  { id: "bot-youth-3", name: "라이징 스타", tier: "youth", avgOvr: 88, mentality: "defend" },
  { id: "bot-youth-4", name: "풋볼 드림", tier: "youth", avgOvr: 91, mentality: "ultra_defend" },
  { id: "bot-youth-5", name: "데뷔조", tier: "youth", avgOvr: 93, mentality: "ultra_attack" },
  // 세미프로 (€150M)
  { id: "bot-semipro-1", name: "세미프로 유니온", tier: "semipro", avgOvr: 83, mentality: "balanced" },
  { id: "bot-semipro-2", name: "컵 다크호스", tier: "semipro", avgOvr: 87, mentality: "attack" },
  { id: "bot-semipro-3", name: "2부 강호", tier: "semipro", avgOvr: 90, mentality: "defend" },
  { id: "bot-semipro-4", name: "승격 플레이오프", tier: "semipro", avgOvr: 93, mentality: "ultra_defend" },
  { id: "bot-semipro-5", name: "돌풍의 팀", tier: "semipro", avgOvr: 95, mentality: "ultra_attack" },
  // 프로 (€220M)
  { id: "bot-pro-1", name: "프로 클럽", tier: "pro", avgOvr: 86, mentality: "balanced" },
  { id: "bot-pro-2", name: "리그 중위권", tier: "pro", avgOvr: 89, mentality: "attack" },
  { id: "bot-pro-3", name: "유로파 컨텐더", tier: "pro", avgOvr: 92, mentality: "defend" },
  { id: "bot-pro-4", name: "상위권 도전", tier: "pro", avgOvr: 95, mentality: "ultra_defend" },
  { id: "bot-pro-5", name: "프로 강호", tier: "pro", avgOvr: 97, mentality: "ultra_attack" },
  // 월드클래스 (€300M)
  { id: "bot-worldclass-1", name: "빅클럽", tier: "worldclass", avgOvr: 89, mentality: "balanced" },
  { id: "bot-worldclass-2", name: "챔스 단골", tier: "worldclass", avgOvr: 92, mentality: "attack" },
  { id: "bot-worldclass-3", name: "우승 후보", tier: "worldclass", avgOvr: 94, mentality: "defend" },
  { id: "bot-worldclass-4", name: "갈락티코스", tier: "worldclass", avgOvr: 97, mentality: "ultra_defend" },
  { id: "bot-worldclass-5", name: "월드 베스트", tier: "worldclass", avgOvr: 99, mentality: "ultra_attack" },
];

export function botsForTier(tier: string): BotTeam[] {
  return BOT_TEAMS.filter((b) => b.tier === tier);
}
