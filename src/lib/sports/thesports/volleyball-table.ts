// 배구 시즌 순위 — TheSports volleyball season/table/detail (공식 순위).
// ⚠️ Vercel serverless IP 는 ts whitelist 미포함 → 직접 fetch 불가, 반드시 DB cache 경유.
//   lightsail standings-poller.js (VOLLEYBALL_SEASONS) 가 fetch → POST
//   /api/internal/thesports-standings → TheSportsStandingsCache (league=VNL 등) upsert.
// AVC/유럽리그는 조별(Pool) 다중 테이블 가능 — tables 전체를 그룹 단위로 반환.
// cache miss/stale(4h+) 시 빈 배열 → page 가 "수집 중" 표시.

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
  if (!cache) return [];
  if (Date.now() - cache.updatedAt.getTime() > STALE_AFTER_MS) return [];
  const payload = cache.payload as { tables?: Array<{ name?: string; rows?: RawRow[] }> } | null;
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
