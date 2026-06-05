// KBO/NPB 시즌 순위 — TheSports season/table/detail (공식 순위).
// ⚠️ Vercel serverless IP 는 ts whitelist 미포함 → 직접 fetch 불가, 반드시 DB cache 경유.
//   lightsail standings-poller.js 가 baseball season/table/detail fetch → POST
//   /api/internal/thesports-standings → TheSportsStandingsCache (league=KBO/NPB) upsert.
//   이 helper 는 cache 읽기 → baseball-team-id-mapping (tsId→ourId) 매핑.
// cache miss/stale(4h+) 시 빈 배열 → page 가 calcStandings fallback.
// team_id 매칭 KBO 10/10·NPB 12/12 검증 (2026-06-05).

import { prisma } from "@/lib/db";
import rawMapping from "./baseball-team-id-mapping.json";

interface MapEntry {
  ourId: number;
  ourLeague: string;
  tsId: string;
}
const mapping = rawMapping as MapEntry[];

const STALE_AFTER_MS = 4 * 60 * 60 * 1000; // worker 10분 주기 → 4h+ 면 stale

export interface BaseballTableRow {
  position: number;
  ourTeamId: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number; // 득점 (runs scored)
  goalsAgainst: number; // 실점
}

interface RawRow {
  team_id: string;
  position: number;
  total: number;
  win: number;
  draw: number;
  loss: number;
  goals: number;
  goals_against: number;
}

/**
 * KBO/NPB 시즌 순위 (TheSports 공식, DB cache 경유). 미지원/cache 없음/stale 시 빈 배열.
 */
export async function fetchBaseballTable(league: string): Promise<BaseballTableRow[]> {
  if (league !== "KBO" && league !== "NPB") return [];
  let row: { payload: unknown; updatedAt: Date } | null;
  try {
    row = await prisma.theSportsStandingsCache.findUnique({
      where: { league },
      select: { payload: true, updatedAt: true },
    });
  } catch {
    return [];
  }
  if (!row) return [];
  if (Date.now() - row.updatedAt.getTime() > STALE_AFTER_MS) return [];

  const payload = row.payload as { tables?: Array<{ rows?: RawRow[] }> };
  const tsIdToOur = new Map(
    mapping.filter((m) => m.ourLeague === league).map((m) => [m.tsId, m.ourId]),
  );
  const rows = (payload.tables ?? []).flatMap((t) => t.rows ?? []);
  return rows
    .map((r): BaseballTableRow | null => {
      const ourTeamId = tsIdToOur.get(r.team_id);
      if (ourTeamId == null) return null;
      return {
        position: r.position,
        ourTeamId,
        played: r.total,
        wins: r.win,
        draws: r.draw,
        losses: r.loss,
        goalsFor: r.goals,
        goalsAgainst: r.goals_against,
      };
    })
    .filter((r): r is BaseballTableRow => r != null)
    .sort((a, b) => a.position - b.position);
}
