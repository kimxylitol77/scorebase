// NHL 스탯 표 로더 — NHL 공식 stats API(api.nhle.com/stats/rest) 스케이터 요약·리얼타임(히트·블록)·골리 요약. 6시간 캐시.
//   시즌은 현재(10월 시작)에 데이터가 없으면 직전 시즌으로 내려간다(2026-09 실측: 2026-27 0건 → 2025-26 최종).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { nhlPlayerKo } from "@/lib/sports/nhl-live-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { khlPlayerInfo, khlPlayerName } from "@/lib/sports/khl-players";
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

/** ts 경기 캐시 집계 리그 — KHL 만(선수 이름 사전 보유). 리가·스위스·체코는 캐시는 있으나 이름 사전이 없어 후속. */
export const TS_HOCKEY_LEAGUES = ["KHL"] as const;

/** KHL 시즌 표 — 종료 경기 캐시 detailLive.players 를 선수별 누적. 코드: 20 유형(1 골리·2 스케이터) 23 TOI초 24 세이브 25 선방률 26 골 27 도움 28 유효슛 56 +/-.
 *  fetch-league-leaders runKhl 과 같은 집계 규칙(리더보드 상위 N 대신 전원). 6시간 캐시. */
export const getTsHockeyStatsData = unstable_cache(
  async (league: string): Promise<{ seasonLabel: string; rows: HockeySeasonRow[]; games: number }> => {
    const now = new Date();
    const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // 8/1 기준, 9월 개막
    const seasonStart = new Date(Date.UTC(startYear, 7, 1));
    const matches = await prisma.match.findMany({
      where: { league, status: "FINISHED", startTime: { gte: seasonStart }, theSportsCache: { isNot: null } },
      select: { homeTeamId: true, awayTeamId: true, theSportsCache: { select: { detailLive: true } } },
    });
    type Row = { id: string; stats: Array<[number, number]> };
    type Acc = { gp: number; g: number; a: number; pm: number; sog: number; toi: number; saves: number; sa: number; ga: number; gtoi: number; goalieGp: number; teamId: number | null };
    const acc = new Map<string, Acc>();
    const stat = (r: Row, k: number) => r.stats.find(([s]) => s === k)?.[1];
    let games = 0;
    for (const m of matches) {
      const dl = m.theSportsCache?.detailLive as { players?: { home?: Row[]; away?: Row[] } } | null;
      if (!dl?.players?.home) continue;
      games++;
      for (const side of ["home", "away"] as const) {
        const teamId = side === "home" ? m.homeTeamId : m.awayTeamId;
        for (const r of dl.players[side] ?? []) {
          if (!r?.id || !Array.isArray(r.stats)) continue;
          const cur = acc.get(r.id) ?? { gp: 0, g: 0, a: 0, pm: 0, sog: 0, toi: 0, saves: 0, sa: 0, ga: 0, gtoi: 0, goalieGp: 0, teamId };
          cur.teamId = teamId ?? cur.teamId;
          const toi = stat(r, 23) ?? 0;
          if (stat(r, 20) === 1) {
            if (toi > 0) {
              const saves = stat(r, 24) ?? 0;
              const pctRaw = stat(r, 25) ?? 0;
              const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw;
              const sa = pct > 0 ? Math.round(saves / pct) : saves;
              cur.goalieGp++; cur.saves += saves; cur.sa += sa; cur.ga += sa - saves; cur.gtoi += toi;
            }
          } else {
            cur.gp++; cur.g += stat(r, 26) ?? 0; cur.a += stat(r, 27) ?? 0; cur.pm += stat(r, 56) ?? 0; cur.sog += stat(r, 28) ?? 0; cur.toi += toi;
          }
          acc.set(r.id, cur);
        }
      }
    }
    const teamIds = [...new Set([...acc.values()].map((a) => a.teamId).filter((v): v is number => v != null))];
    const teams = await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } });
    const teamKo = new Map(teams.map((t) => [t.id, toKoreanTeamName(t.name, league)]));
    const rows: HockeySeasonRow[] = [];
    for (const [id, a] of acc) {
      const info = khlPlayerInfo(id);
      const name = info ? khlPlayerName(info) : id; // 사전 미등록(9/23 실측 572명 중 45명)은 리더보드와 같이 원본 id
      const photo = info?.photo ?? null;
      const team = a.teamId != null ? teamKo.get(a.teamId) ?? "" : "";
      if (a.goalieGp > 0) {
        rows.push({ playerId: Number.parseInt(id, 36) || 0, name, team, pos: "G", gp: a.goalieGp, gs: a.goalieGp, saves: a.saves, shotsAgainst: a.sa,
          savePct: a.sa > 0 ? a.saves / a.sa : null, gaa: a.gtoi > 0 ? (a.ga * 3600) / a.gtoi : null, wins: undefined, losses: undefined, otl: undefined, shutouts: undefined, tsId: id, photo } as HockeySeasonRow & { tsId: string });
      }
      if (a.gp > 0) {
        rows.push({ playerId: Number.parseInt(id, 36) || 0, name, team, pos: info?.pos === "D" ? "D" : "F", gp: a.gp, goals: a.g, assists: a.a, points: a.g + a.a,
          shots: a.sog, shootingPct: a.sog > 0 ? (a.g / a.sog) * 100 : null, plusMinus: a.pm, toiPerGame: a.gp > 0 ? a.toi / 60 / a.gp : 0, tsId: id, photo } as HockeySeasonRow & { tsId: string });
      }
    }
    return { seasonLabel: `${startYear}-${String(startYear + 1).slice(2)}`, rows, games };
  },
  ["ts-hockey-stats-data"],
  { revalidate: 6 * 3600 },
);
