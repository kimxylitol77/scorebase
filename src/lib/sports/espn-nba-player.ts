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

/* ============================================================
 * 시즌별 career 기록 + 통산 평균 — /stats (averages category).
 * ==========================================================*/

export interface NbaSeasonRow {
  year: number; // 2024 (없으면 0 = 통산)
  label: string; // "2023-24" 또는 "통산"
  teamSlug: string;
  gp: number; gs: number; min: number;
  pts: number; reb: number; oreb: number; dreb: number;
  ast: number; stl: number; blk: number; to: number; pf: number;
  fgPct: number; fg3Pct: number; ftPct: number;
}

interface EspnStatCat {
  name: string; labels: string[];
  statistics?: Array<{ season?: { year?: number; displayName?: string }; teamSlug?: string; stats: string[] }>;
  totals?: string[];
}

// labels 동적 인덱싱(ESPN 순서 변동 대비). made-attempted 컬럼은 "7.9-18.9" 형식이라 % 만 사용.
function seasonRow(labels: string[], stats: string[], year: number, label: string, teamSlug: string): NbaSeasonRow {
  const num = (l: string) => {
    const i = labels.indexOf(l);
    return i >= 0 ? parseFloat(stats[i]) || 0 : 0;
  };
  return {
    year, label, teamSlug,
    gp: num("GP"), gs: num("GS"), min: num("MIN"),
    pts: num("PTS"), reb: num("REB"), oreb: num("OR"), dreb: num("DR"),
    ast: num("AST"), stl: num("STL"), blk: num("BLK"), to: num("TO"), pf: num("PF"),
    fgPct: num("FG%"), fg3Pct: num("3P%"), ftPct: num("FT%"),
  };
}

const getEspnSeasons = unstable_cache(
  async (espnId: string): Promise<{ seasons: NbaSeasonRow[]; career: NbaSeasonRow | null }> => {
    const d = await espnJson(`${ESPN}/${espnId}/stats`);
    const cats = d?.categories as EspnStatCat[] | undefined;
    const avg = cats?.find((c) => c.name === "averages");
    if (!avg?.labels || !avg.statistics?.length) return { seasons: [], career: null };
    const seasons = avg.statistics
      .filter((s) => Array.isArray(s.stats) && s.stats.length === avg.labels.length)
      .map((s) =>
        seasonRow(avg.labels, s.stats, s.season?.year ?? 0, s.season?.displayName ?? "—", s.teamSlug ?? ""),
      );
    const career = avg.totals?.length === avg.labels.length
      ? seasonRow(avg.labels, avg.totals, 0, "통산", "")
      : null;
    return { seasons, career };
  },
  ["espn-nba-seasons"], { revalidate: 1800 },
);

export const fetchNbaEspnSeasons = getEspnSeasons;

/* ============================================================
 * 스플릿 — /splits (홈/원정·승/패·월별). names 동적 매핑.
 * ==========================================================*/

export interface NbaSplitRow {
  label: string;
  gp: number; pts: number; reb: number; ast: number; fgPct: number;
}
export interface NbaSplits {
  home: NbaSplitRow | null; away: NbaSplitRow | null;
  wins: NbaSplitRow | null; losses: NbaSplitRow | null;
  byMonth: NbaSplitRow[];
}

interface EspnSplitCat { name: string; splits?: Array<{ displayName: string; stats: string[] }> }

const MONTH_KO: Record<string, string> = {
  October: "10월", November: "11월", December: "12월", January: "1월",
  February: "2월", March: "3월", April: "4월",
};

const getEspnSplits = unstable_cache(
  async (espnId: string): Promise<NbaSplits | null> => {
    const d = await espnJson(`${ESPN}/${espnId}/splits`);
    const names = d?.names as string[] | undefined;
    const cats = d?.splitCategories as EspnSplitCat[] | undefined;
    if (!names || !cats) return null;
    const row = (label: string, stats: string[]): NbaSplitRow => {
      const v = (n: string) => {
        const i = names.indexOf(n);
        return i >= 0 ? parseFloat(stats[i]) || 0 : 0;
      };
      return { label, gp: v("gamesPlayed"), pts: v("avgPoints"), reb: v("avgRebounds"), ast: v("avgAssists"), fgPct: v("fieldGoalPct") };
    };
    const find = (catName: string, splitName: string, label: string): NbaSplitRow | null => {
      const sp = cats.find((c) => c.name === catName)?.splits?.find((s) => s.displayName === splitName);
      return sp?.stats ? row(label, sp.stats) : null;
    };
    // splitCategories.name 은 'split'/'byMonth'/'byResult' (displayName 은 'Month'/'Result').
    const monthCat = cats.find((c) => c.name === "byMonth");
    const byMonth = (monthCat?.splits ?? [])
      .filter((s) => MONTH_KO[s.displayName] && s.stats)
      .map((s) => row(MONTH_KO[s.displayName], s.stats));
    return {
      home: find("split", "Home", "홈"),
      away: find("split", "Road", "원정"),
      wins: find("byResult", "Wins", "승리"),
      losses: find("byResult", "Losses", "패배"),
      byMonth,
    };
  },
  ["espn-nba-splits"], { revalidate: 1800 },
);

export const fetchNbaEspnSplits = getEspnSplits;

/* ============================================================
 * 수상 이력 — /bio (awards). All-NBA·All-Star·MVP 등.
 * ==========================================================*/

export interface NbaAward { name: string; count: string; seasons: string[] }

const getEspnAwards = unstable_cache(
  async (espnId: string): Promise<NbaAward[]> => {
    const d = await espnJson(`${ESPN}/${espnId}/bio`);
    const awards = d?.awards as Array<{ name?: string; displayCount?: string; seasons?: string[] }> | undefined;
    if (!awards) return [];
    return awards
      .filter((a) => a.name)
      .map((a) => ({ name: a.name as string, count: a.displayCount ?? "", seasons: a.seasons ?? [] }));
  },
  ["espn-nba-awards"], { revalidate: 86400 },
);

export const fetchNbaEspnAwards = getEspnAwards;
