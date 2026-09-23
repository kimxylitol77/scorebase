// KBL 스탯 표 로더 — KBL 공식 통계 API 전체 선수 시즌 평균(최근 시즌, 규정 미달 포함 ruleCk=0). 6시간 캐시.
import { unstable_cache } from "next/cache";
import { fetchKblRecentSeason, fetchKblSeasonPlayerAverages, kblSeasonLabel } from "@/lib/sports/kbl-api";
import { kblPlayer } from "@/lib/sports/kbl-players";
import type { BasketballSeasonRow } from "./stats-table";

export const getKblStatsData = unstable_cache(
  async (): Promise<{ season: string; rows: BasketballSeasonRow[] }> => {
    const recent = await fetchKblRecentSeason();
    if (!recent) return { season: "", rows: [] };
    const list = await fetchKblSeasonPlayerAverages(recent.seasonCode, { ruleCk: 0 });
    const rows: BasketballSeasonRow[] = list.map((p) => ({
      playerId: String(p.playerNo), name: p.kname, team: p.teamName1, pos: kblPlayer(String(p.playerNo))?.pos ?? null, gp: p.gameCount,
      min: p.playSec / 60, pts: p.score, reb: p.rb, ast: p.aS, stl: p.sT, blk: p.bS, tpm: p.threep, fgPct: p.fdgRt ?? null,
    }));
    return { season: kblSeasonLabel(recent.seasonName), rows };
  },
  ["kbl-stats-data"],
  { revalidate: 6 * 3600 },
);
