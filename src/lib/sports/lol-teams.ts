// LoL 팀 영문명 사전 reader — data/lol-teams.json (scripts/build-lol-teams.ts 생성).
// 경기 기록(Match.lolGames)의 red/blue.name 은 한국어라 /en 화면에 그대로 쓰면 한글이 새어 나간다.
// ts 팀 id 로 영문명을 돌려준다.
import rawTeams from "../../../data/lol-teams.json";

interface Row { name: string; abbr?: string; logo?: string }
const TEAMS = (rawTeams as { teams?: Record<string, Row> }).teams ?? {};

/** ts 팀 id → 영문 팀명. 사전에 없으면 null (호출부가 한국어명으로 폴백한다). */
export function lolTeamNameEn(tsTeamId: string | null | undefined): string | null {
  if (!tsTeamId) return null;
  return TEAMS[tsTeamId]?.name ?? null;
}

export function lolTeamAbbr(tsTeamId: string | null | undefined): string | null {
  if (!tsTeamId) return null;
  return TEAMS[tsTeamId]?.abbr ?? null;
}
