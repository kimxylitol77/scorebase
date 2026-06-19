// NBA 선수 통계 — ESPN athlete overview(시즌평균) + gamelog(최근경기 박스스코어).
// BDL season_averages·stats 가 plan 401 로 막혀 무료 ESPN 으로 우회. BDL NbaSeasonAverages·
// NbaGameStat 형식으로 변환해 renderNbaPlayerView 가 그대로 렌더. page 가 force-dynamic 이라
// fetch 캐시가 무효 → unstable_cache 로 캐싱(15분). (espn-nba.ts 는 매치 scoreboard 용 별개)

import { unstable_cache } from "next/cache";
import type { NbaSeasonAverages, NbaGameStat } from "./balldontlie";

const ESPN = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes";

async function espnJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// 시즌평균 — overview.statistics.splits(Regular Season) 의 names↔stats 배열 매핑.
//  ESPN 은 oreb/dreb·fgm/fga 분리값을 안 줌 → 0(페이지에서 미표시 처리).
const getEspnAvg = unstable_cache(
  async (espnId: string): Promise<NbaSeasonAverages | null> => {
    const d = await espnJson(`${ESPN}/${espnId}/overview`);
    const st = d?.statistics as { names?: string[]; splits?: Array<{ displayName: string; stats: string[] }> } | undefined;
    if (!st?.names || !st.splits?.length) return null;
    const sp = st.splits.find((s) => /regular/i.test(s.displayName)) ?? st.splits[0];
    const v = (name: string) => {
      const i = st.names!.indexOf(name);
      return i >= 0 ? parseFloat(sp.stats[i]) || 0 : 0;
    };
    if (!v("gamesPlayed")) return null;
    return {
      season: 0, gamesPlayed: Math.round(v("gamesPlayed")), min: String(v("avgMinutes")),
      pts: v("avgPoints"), ast: v("avgAssists"), reb: v("avgRebounds"), oreb: 0, dreb: 0,
      stl: v("avgSteals"), blk: v("avgBlocks"), turnover: v("avgTurnovers"), pf: v("avgFouls"),
      fgm: 0, fga: 0, fgPct: v("fieldGoalPct") / 100, fg3m: 0, fg3a: 0,
      fg3Pct: v("threePointPct") / 100, ftm: 0, fta: 0, ftPct: v("freeThrowPct") / 100,
    };
  },
  ["espn-nba-avg"], { revalidate: 1800 },
);

interface GlEvent { eventId: string; stats: string[] }
interface GlMeta {
  gameDate?: string; atVs?: string;
  opponent?: { abbreviation?: string; displayName?: string };
  team?: { abbreviation?: string };
  homeTeamScore?: number; awayTeamScore?: number;
}

// 최근경기 — gamelog.seasonTypes(최신).categories.events(stats) + events 맵(상대·날짜·점수).
const getEspnGames = unstable_cache(
  async (espnId: string): Promise<NbaGameStat[]> => {
    const d = await espnJson(`${ESPN}/${espnId}/gamelog`);
    const names = d?.names as string[] | undefined;
    const seasonTypes = d?.seasonTypes as Array<{ categories?: Array<{ events?: GlEvent[] }> }> | undefined;
    const events = d?.events as Record<string, GlMeta> | undefined;
    if (!names || !seasonTypes || !events) return [];
    const i = (n: string) => names.indexOf(n);
    const iMin = i("minutes"), iReb = i("totalRebounds"), iAst = i("assists"),
      iStl = i("steals"), iBlk = i("blocks"), iTo = i("turnovers"), iPts = i("points");
    const rows: NbaGameStat[] = [];
    for (const stype of seasonTypes) {
      for (const cat of stype.categories ?? []) {
        for (const ev of cat.events ?? []) {
          const meta = events[ev.eventId];
          if (!meta || !ev.stats) continue;
          const n = (idx: number) => parseInt(ev.stats[idx], 10) || 0;
          const away = meta.atVs === "@";
          const myAbbr = meta.team?.abbreviation ?? "";
          const oppAbbr = meta.opponent?.abbreviation ?? "";
          rows.push({
            id: Number(ev.eventId), min: ev.stats[iMin] ?? "0",
            pts: n(iPts), reb: n(iReb), ast: n(iAst), stl: n(iStl), blk: n(iBlk), turnover: n(iTo),
            fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
            game: {
              id: Number(ev.eventId), date: meta.gameDate ?? "",
              homeTeam: { abbr: away ? oppAbbr : myAbbr, fullName: "" },
              visitorTeam: { abbr: away ? myAbbr : oppAbbr, fullName: "" },
              homeTeamScore: meta.homeTeamScore ?? 0, visitorTeamScore: meta.awayTeamScore ?? 0,
            },
          });
        }
      }
    }
    // 모든 seasonType(Play In·정규시즌 등) 합쳐 날짜 내림차순 → 최근 10경기
    rows.sort((a, b) => (b.game?.date ?? "").localeCompare(a.game?.date ?? ""));
    return rows.slice(0, 10);
  },
  ["espn-nba-games"], { revalidate: 1800 },
);

export async function fetchNbaEspnStats(espnId: string): Promise<{ avg: NbaSeasonAverages | null; recent: NbaGameStat[] }> {
  const [avg, recent] = await Promise.all([getEspnAvg(espnId), getEspnGames(espnId)]);
  return { avg, recent };
}
