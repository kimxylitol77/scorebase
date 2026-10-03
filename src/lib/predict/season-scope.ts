// 경기 상세 "시즌 전체"(순위·시즌 통계·시즌 폼) 범위 — 그 경기가 속한 시즌만. 개막 직후엔 지난 시즌으로 대신한다.
// 리그 전 기간 경기를 그대로 합치면 이력이 여러 시즌 쌓인 리그는 "180승 180패(360경기)"처럼 통산이 된다(2026-10-03 KBL 백필 후 발견).
import { SEASON_BOUNDARY, currentSeasonStart, previousSeasonStart } from "./season-window";

/** 이번 시즌 종료 경기가 이보다 적은 팀이 있으면 지난 시즌을 보여 준다 */
export const MIN_SEASON_GAMES = 3;

export function seasonScopedMatches<T extends { startTime: Date; status: string; homeTeamId: number; awayTeamId: number }>(
  matches: T[],
  league: string,
  at: Date,
  teamIds: number[],
): { matches: T[]; label: "시즌 전체" | "지난 시즌" } {
  if (!SEASON_BOUNDARY[league]) return { matches, label: "시즌 전체" };
  const start = currentSeasonStart(league, at)!;
  const current = matches.filter((m) => m.startTime >= start);
  const played = (id: number) =>
    current.filter((m) => m.status === "FINISHED" && m.startTime < at && (m.homeTeamId === id || m.awayTeamId === id)).length;
  if (teamIds.every((id) => played(id) >= MIN_SEASON_GAMES)) return { matches: current, label: "시즌 전체" };
  const prevStart = previousSeasonStart(start);
  const prev = matches.filter((m) => m.startTime >= prevStart && m.startTime < start);
  return prev.length > 0 ? { matches: prev, label: "지난 시즌" } : { matches: current, label: "시즌 전체" };
}
