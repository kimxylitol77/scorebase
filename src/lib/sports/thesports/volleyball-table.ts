// 배구 시즌 순위 — TheSports volleyball season/table/detail (공식 순위).
// ⚠️ Vercel serverless IP 는 ts whitelist 미포함 → 직접 fetch 불가, 반드시 DB cache 경유.
//   lightsail standings-poller.js (VOLLEYBALL_SEASONS) 가 fetch → POST
//   /api/internal/thesports-standings → TheSportsStandingsCache (league=VNL 등) upsert.
// AVC/유럽리그는 조별(Pool) 다중 테이블 가능 — tables 전체를 그룹 단위로 반환.
// cache miss/stale(4h+) 시 DB 종료 경기의 세트 스코어로 순위를 계산해 보완.

import { prisma } from "@/lib/db";
import rawMapping from "./volleyball-team-id-mapping.json";

interface MapEntry { ourId: number; tsId: string }
const tsToOur = new Map((rawMapping as MapEntry[]).map((m) => [m.tsId, m.ourId]));

const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // poller 10분 주기 → 4h+ 면 stale

export interface VolleyballTableRow {
  position: number;
  ourTeamId: number;
  played: number;
  wins: number;
  losses: number;
  setsWin: number;
  setsLoss: number;
  points: number;
}

export interface VolleyballTableGroup {
  name: string; // "Team"(단일 풀리그) / "Pool A" 등
  rows: VolleyballTableRow[];
}

interface RawRow {
  team_id: string;
  position: number;
  points: number;
  total: number;
  win: number;
  loss: number;
  sets_win: number;
  sets_loss: number;
}

export async function fetchVolleyballTable(league: string): Promise<VolleyballTableGroup[]> {
  const cache = await prisma.theSportsStandingsCache.findUnique({ where: { league } });
  const cached = parseCachePayload(cache?.payload ?? null);
  const fresh = cache != null && Date.now() - cache.updatedAt.getTime() <= STALE_AFTER_MS;
  if (fresh && cached.length > 0) return cached;
  const calc = await fetchCalculatedTable(league);
  if (calc.length > 0) return calc;
  // 시즌 종료 리그(V-리그 비시즌 등)는 poller 가 캐시를 안 돌려 stale 이지만,
  // DB 매치도 없어 계산 폴백이 비면 마지막 공식 표를 그대로 유지한다.
  return cached;
}

function parseCachePayload(raw: unknown): VolleyballTableGroup[] {
  const payload = raw as { tables?: Array<{ name?: string; rows?: RawRow[] }> } | null;
  if (!payload || !Array.isArray(payload.tables)) return [];

  const groups: VolleyballTableGroup[] = [];
  for (const t of payload.tables) {
    if (!Array.isArray(t.rows) || t.rows.length === 0) continue;
    const rows = t.rows
      .map((r) => {
        const ourTeamId = tsToOur.get(r.team_id);
        if (ourTeamId == null) return null;
        return {
          position: r.position,
          ourTeamId,
          played: r.total ?? 0,
          wins: r.win ?? 0,
          losses: r.loss ?? 0,
          setsWin: r.sets_win ?? 0,
          setsLoss: r.sets_loss ?? 0,
          points: r.points ?? 0,
        };
      })
      .filter((r): r is VolleyballTableRow => r !== null)
      .sort((a, b) => a.position - b.position);
    if (rows.length > 0) groups.push({ name: t.name || "순위", rows });
  }
  return groups;
}

async function fetchCalculatedTable(league: string): Promise<VolleyballTableGroup[]> {
  const now = new Date();
  const currentYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  let matches = await prisma.match.findMany({
    where: {
      league,
      status: "FINISHED",
      startTime: { gte: currentYear },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  if (matches.length === 0) {
    matches = await prisma.match.findMany({
      where: {
        league,
        status: "FINISHED",
        startTime: { gte: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)), lt: currentYear },
        homeScore: { not: null },
        awayScore: { not: null },
      },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
  }
  if (matches.length === 0) return [];

  const byTeam = new Map<number, Omit<VolleyballTableRow, "position">>();
  const ensure = (teamId: number) => {
    let row = byTeam.get(teamId);
    if (!row) {
      row = { ourTeamId: teamId, played: 0, wins: 0, losses: 0, setsWin: 0, setsLoss: 0, points: 0 };
      byTeam.set(teamId, row);
    }
    return row;
  };
  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) continue;
    const home = ensure(match.homeTeamId);
    const away = ensure(match.awayTeamId);
    home.played += 1;
    away.played += 1;
    home.setsWin += match.homeScore;
    home.setsLoss += match.awayScore;
    away.setsWin += match.awayScore;
    away.setsLoss += match.homeScore;
    const homeWon = match.homeScore > match.awayScore;
    const winner = homeWon ? home : away;
    const loser = homeWon ? away : home;
    winner.wins += 1;
    loser.losses += 1;
    if (Math.min(match.homeScore, match.awayScore) === 2) {
      winner.points += 2;
      loser.points += 1;
    } else {
      winner.points += 3;
    }
  }
  const rows = [...byTeam.values()]
    .sort((left, right) =>
      right.points - left.points
      || right.wins - left.wins
      || (right.setsWin - right.setsLoss) - (left.setsWin - left.setsLoss),
    )
    .map((row, index) => ({ ...row, position: index + 1 }));
  return rows.length > 0 ? [{ name: "경기 결과 집계", rows }] : [];
}
