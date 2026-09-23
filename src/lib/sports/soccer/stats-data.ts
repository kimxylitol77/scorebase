// 축구 스탯 표 로더 — 리그별 현재 시즌 아카이브(ts) + 선수 이름·사진 + 경기 로그 분 가중 평점. 6시간 캐시.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import rawPhotos from "../../../../data/player-photos.json";
import { toKoreanTeamName } from "@/lib/team-names";
import type { SoccerSeasonRow } from "./stats-table";

const PHOTOS = rawPhotos as Record<string, string>;

/** 시즌 표가 있는 리그(2026-09 실측 45명 미만 리그 제외). 순서 = 화면 필 순서. */
export const SOCCER_STATS_LEAGUES = [
  "EPL", "LALIGA", "SERIE_A", "BUNDESLIGA", "LIGUE_1", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "MLS",
  "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SAUDI_PL", "BRASILEIRAO",
] as const;
export type SoccerStatsLeague = (typeof SOCCER_STATS_LEAGUES)[number];

/** 유럽 시즌 시작(7/1). 7월 이후면 올해, 아니면 작년. */
function seasonStartUtc(now = new Date()): Date {
  const y = now.getUTCFullYear();
  return new Date(Date.UTC(now.getUTCMonth() >= 6 ? y : y - 1, 6, 1));
}

interface ArchiveStat {
  pos?: string; team?: string; matches?: number; starts?: number; minutes?: number | null; goals?: number; assists?: number;
  shots?: number; sot?: number; keyPasses?: number; passAcc?: number | null; tackles?: number; interceptions?: number;
  yellow?: number; red?: number; saves?: number; cleanSheets?: number | null; conceded?: number | null;
}

export const getSoccerStatsData = unstable_cache(
  async (league: string): Promise<{ season: string; rows: SoccerSeasonRow[]; ratingCoverage: number }> => {
    // 리그별 현재 시즌 = seasonLabel 최댓값 ("2026-27" > "2025-26", 달력 리그는 "2026")
    const labels = await prisma.playerSeasonStatArchive.groupBy({ by: ["seasonLabel"], where: { source: "ts", league } });
    const season = labels.map((l) => l.seasonLabel).sort().at(-1);
    if (!season) return { season: "", rows: [], ratingCoverage: 0 };
    const arch = await prisma.playerSeasonStatArchive.findMany({ where: { source: "ts", league, seasonLabel: season }, select: { playerId: true, stat: true } });
    const ids = arch.map((a) => a.playerId);
    const [players, ratings] = await Promise.all([
      prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true, photoUrl: true } }),
      // 분 가중 평점 — 시즌 시작 이후 전 대회(리그 컵·유럽 대항전 포함). af 리그만 로그가 있다.
      prisma.$queryRaw<Array<{ playerId: string; wr: number | null; mins: number | null }>>`
        SELECT "playerId", SUM(rating * minutes)::float AS wr, SUM(minutes)::int AS mins
        FROM "PlayerMatchLog"
        WHERE "playerId" = ANY(${ids}) AND date >= ${seasonStartUtc()} AND rating IS NOT NULL AND minutes >= 10
        GROUP BY "playerId"`,
    ]);
    const nameOf = new Map(players.map((p) => [p.id, { name: p.nameKo || p.name, photo: PHOTOS[p.id] || p.photoUrl || null }]));
    const ratingOf = new Map(ratings.map((r) => [r.playerId, r.mins && r.mins > 0 && r.wr != null ? { rating: r.wr / r.mins, mins: r.mins } : null]));
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const rows: SoccerSeasonRow[] = arch.map((a) => {
      const s = (a.stat ?? {}) as ArchiveStat;
      const nm = nameOf.get(a.playerId);
      const rt = ratingOf.get(a.playerId) ?? null;
      return {
        playerId: a.playerId, name: nm?.name ?? a.playerId, team: s.team ? toKoreanTeamName(s.team) : "", pos: s.pos ?? null, photo: nm?.photo ?? null,
        matches: n(s.matches), starts: n(s.starts), minutes: n(s.minutes), goals: n(s.goals), assists: n(s.assists), shots: n(s.shots), sot: n(s.sot),
        keyPasses: n(s.keyPasses), passAcc: s.passAcc ?? null, tackles: n(s.tackles), interceptions: n(s.interceptions), yellow: n(s.yellow), red: n(s.red),
        saves: n(s.saves), cleanSheets: s.cleanSheets ?? null, conceded: s.conceded ?? null, rating: rt?.rating ?? null, ratedMinutes: rt?.mins ?? 0,
      };
    });
    // 평점 신뢰 게이트 — 커버리지가 낮거나 평균이 5 미만(결측이 0 으로 섞인 리그, K리그 실측)이면 열을 비운다
    const rated = rows.filter((r) => r.rating != null && r.minutes > 0);
    const avg = rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : 0;
    const ratingCoverage = rows.length ? rated.length / rows.length : 0;
    if (ratingCoverage < 0.3 || avg < 5) for (const r of rows) { r.rating = null; r.ratedMinutes = 0; }
    return { season, rows, ratingCoverage: ratingCoverage < 0.3 || avg < 5 ? 0 : ratingCoverage };
  },
  ["soccer-stats-data"],
  { revalidate: 6 * 3600 },
);
