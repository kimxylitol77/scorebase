// KBL 스탯 표 로더 — KBL 공식 통계 API 전체 선수 시즌 평균(기본 최근 시즌, seasonCode 로 지난 시즌, 규정 미달 포함 ruleCk=0). 6시간 캐시.
import { unstable_cache } from "next/cache";
import { fetchKblRecentSeason, fetchKblSeasonList, fetchKblSeasonPlayerAverages, kblSeasonLabel } from "@/lib/sports/kbl-api";
import { kblPlayer } from "@/lib/sports/kbl-players";
import type { BasketballSeasonRow } from "./stats-table";

export const getKblStatsData = unstable_cache(
  async (seasonCode?: number): Promise<{ season: string; rows: BasketballSeasonRow[] }> => {
    const recent = seasonCode
      ? (await fetchKblSeasonList()).map((x) => ({ seasonCode: x.seasonCode, seasonName: x.name })).find((x) => x.seasonCode === seasonCode)
      : await fetchKblRecentSeason();
    if (!recent) return { season: "", rows: [] };
    const list = await fetchKblSeasonPlayerAverages(recent.seasonCode, { ruleCk: 0 });
    // API 실패(타임아웃)도 빈 목록으로 오므로 던져서 6시간 캐시되지 않게 한다 — 화면은 호출부에서 빈 표로 받는다
    if (list.length === 0) throw new Error(`KBL 시즌 ${recent.seasonCode} 선수 기록 없음`);
    const rows: BasketballSeasonRow[] = list.map((p) => ({
      playerId: String(p.playerNo), name: p.kname, team: p.teamName1, pos: kblPlayer(String(p.playerNo))?.pos ?? null, gp: p.gameCount,
      min: p.playSec / 60, pts: p.score, reb: p.rb, ast: p.aS, stl: p.sT, blk: p.bS, tpm: p.threep, fgPct: p.fdgRt ?? null,
    }));
    return { season: kblSeasonLabel(recent.seasonName), rows };
  },
  ["kbl-stats-data-v3"],
  { revalidate: 6 * 3600 },
);
