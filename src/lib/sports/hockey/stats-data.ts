// NHL 스탯 표 로더 — NHL 공식 stats API(api.nhle.com/stats/rest) 스케이터 요약·리얼타임(히트·블록)·골리 요약. 6시간 캐시.
//   시즌은 현재(10월 시작)에 데이터가 없으면 직전 시즌으로 내려간다(2026-09 실측: 2026-27 0건 → 2025-26 최종).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { nhlPlayerKo } from "@/lib/sports/nhl-live-names";
import { toKoreanTeamName } from "@/lib/team-names";
import type { HockeySeasonRow } from "./stats-table";

const BASE = "https://api.nhle.com/stats/rest/en";

async function getAll<T>(path: string, seasonId: string): Promise<T[]> {
  const r = await fetch(`${BASE}/${path}?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return [];
  const d = (await r.json()) as { data?: T[] };
  return d.data ?? [];
}

function seasonCandidates(now = new Date()): string[] {
  const y = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 9 ? y : y - 1; // 10월 개막
  return [`${start}${start + 1}`, `${start - 1}${start}`];
}

export const getNhlStatsData = unstable_cache(
  async (): Promise<{ seasonId: string; seasonLabel: string; final: boolean; rows: HockeySeasonRow[] }> => {
    type Sk = { playerId: number; skaterFullName: string; teamAbbrevs: string; positionCode: string; gamesPlayed: number; goals: number; assists: number; points: number; plusMinus: number; penaltyMinutes: number; shots: number; shootingPct: number | null; timeOnIcePerGame: number; ppGoals: number; ppPoints: number; gameWinningGoals: number; faceoffWinPct: number | null };
    type Rt = { playerId: number; hits: number; blockedShots: number };
    type Gk = { playerId: number; goalieFullName: string; teamAbbrevs: string; gamesPlayed: number; gamesStarted: number; wins: number; losses: number; otLosses: number; goalsAgainstAverage: number | null; savePct: number | null; saves: number; shotsAgainst: number; shutouts: number };
    let seasonId = "", skaters: Sk[] = [];
    const cands = seasonCandidates();
    for (const s of cands) { skaters = await getAll<Sk>("skater/summary", s); if (skaters.length > 0) { seasonId = s; break; } }
    if (!seasonId) return { seasonId: cands[0], seasonLabel: `${cands[0].slice(0, 4)}-${cands[0].slice(6)}`, final: false, rows: [] };
    const [rt, goalies, teams] = await Promise.all([
      getAll<Rt>("skater/realtime", seasonId),
      getAll<Gk>("goalie/summary", seasonId),
      prisma.team.findMany({ where: { league: "NHL" }, select: { name: true, shortName: true } }),
    ]);
    const rtOf = new Map(rt.map((r) => [r.playerId, r]));
    // 팀 약어 → 한글 팀명 (트레이드 선수는 "A, B" 꼴 → 마지막 팀)
    const teamKo = new Map(teams.map((t) => [t.shortName ?? "", toKoreanTeamName(t.name)]));
    const teamOf = (abbr: string) => { const last = abbr.split(",").map((s) => s.trim()).pop() ?? abbr; return teamKo.get(last) ?? last; };
    const nameOf = (id: number, en: string) => nhlPlayerKo(String(id)) || en;
    const rows: HockeySeasonRow[] = [
      ...skaters.map((s) => ({
        playerId: s.playerId, name: nameOf(s.playerId, s.skaterFullName), team: teamOf(s.teamAbbrevs), pos: s.positionCode, gp: s.gamesPlayed,
        goals: s.goals, assists: s.assists, points: s.points, plusMinus: s.plusMinus, pim: s.penaltyMinutes, shots: s.shots,
        shootingPct: s.shootingPct != null ? s.shootingPct * 100 : null, toiPerGame: s.timeOnIcePerGame / 60, ppGoals: s.ppGoals, ppPoints: s.ppPoints, gwg: s.gameWinningGoals,
        faceoffPct: s.faceoffWinPct != null ? s.faceoffWinPct * 100 : null, hits: rtOf.get(s.playerId)?.hits ?? 0, blocks: rtOf.get(s.playerId)?.blockedShots ?? 0,
      })),
      ...goalies.map((g) => ({
        playerId: g.playerId, name: nameOf(g.playerId, g.goalieFullName), team: teamOf(g.teamAbbrevs), pos: "G", gp: g.gamesPlayed, gs: g.gamesStarted,
        wins: g.wins, losses: g.losses, otl: g.otLosses, gaa: g.goalsAgainstAverage, savePct: g.savePct, saves: g.saves, shotsAgainst: g.shotsAgainst, shutouts: g.shutouts,
      })),
    ];
    return { seasonId, seasonLabel: `${seasonId.slice(0, 4)}-${seasonId.slice(6)}`, final: seasonId !== cands[0], rows };
  },
  ["nhl-stats-data"],
  { revalidate: 6 * 3600 },
);

/** NHL 헤드샷 — 시즌·팀 약어·선수 id */
export function nhlHeadshot(seasonId: string, teamAbbr: string, playerId: number): string {
  return `https://assets.nhle.com/mugs/nhl/${seasonId}/${teamAbbr}/${playerId}.png`;
}
