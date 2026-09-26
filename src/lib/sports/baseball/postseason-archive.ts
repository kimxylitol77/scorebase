// KBO·NPB 포스트시즌 선수 기록 조회 — collect-baseball-postseason 잡이 PlayerSeasonStatArchive 에 시즌별로 저장한 행을 읽는다(10분 캐시).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { BbPlayerRow } from "./player-rankings";
import { PS_ARCHIVE_SOURCE } from "./postseason-aggregate";
import { postseasonMinIp } from "./mlb-postseason-stats-build";

export type ArchivePsLeague = keyof typeof PS_ARCHIVE_SOURCE;

/** 저장된 시즌 (최신순) */
export const getArchivePostseasonSeasons = unstable_cache(
  async (league: ArchivePsLeague): Promise<number[]> => {
    const g = await prisma.playerSeasonStatArchive.groupBy({ by: ["seasonLabel"], where: { source: PS_ARCHIVE_SOURCE[league] } });
    return g.map((x) => Number(x.seasonLabel)).filter(Number.isFinite).sort((a, b) => b - a);
  },
  ["baseball-ps-archive-seasons-v1"],
  { revalidate: 600 },
);

export const getArchivePostseason = unstable_cache(
  async (league: ArchivePsLeague, season: number): Promise<{ bat: BbPlayerRow[]; pit: BbPlayerRow[]; minIp: number } | null> => {
    const rows = await prisma.playerSeasonStatArchive.findMany({ where: { source: PS_ARCHIVE_SOURCE[league], seasonLabel: String(season) }, select: { stat: true } });
    if (rows.length === 0) return null;
    const all = rows.map((r) => r.stat as unknown as BbPlayerRow & { role: "bat" | "pit" });
    const pit = all.filter((r) => r.role === "pit");
    return { bat: all.filter((r) => r.role === "bat"), pit, minIp: postseasonMinIp(pit) };
  },
  ["baseball-ps-archive-v1"],
  { revalidate: 600 },
);
