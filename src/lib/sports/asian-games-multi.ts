// 아시안게임 농구·배구·야구(5개 대회) 허브 데이터 — 축구 허브(AsianGamesHub)와 같은 화면을 채운다.
//  조 표: 배구·야구 = ts season/table/detail(조 이름 있음), 농구 = ts 순위 API 미인가라 경기 결과로 계산(asian-games-standings).
//  조 표 밖 경기 = 결선. 라운드·메달은 asian-games-knockout 이 경기 흐름으로 가린다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { thesportsGet } from "@/lib/sports/thesports/client";
import { getAgBkStandings } from "@/lib/sports/basketball/asian-games-standings";
import { buildKnockout, type KoMatch, type KoResult } from "@/lib/sports/asian-games-knockout";

type Sport = "basketball" | "volleyball" | "baseball";
/** ts 시즌 id — match/diary 로 찾았다(2026-10-01). 농구는 asian-games-standings 의 AG_BK_TS_SEASON. */
export const AG_MULTI: Record<string, { sport: Sport; season: string | null; men: boolean }> = {
  ASIAN_GAMES_BK: { sport: "basketball", season: null, men: true },
  ASIAN_GAMES_BK_W: { sport: "basketball", season: null, men: false },
  VB_ASIAN_GAMES: { sport: "volleyball", season: "y39mpwhyk20qojx", men: true },
  VB_ASIAN_GAMES_W: { sport: "volleyball", season: "965mkdheg6or1ge", men: false },
  ASIAN_GAMES_BB: { sport: "baseball", season: "k82re4so8ykqepz", men: true },
};

export interface AgTableRow { teamId: number; position: number; played: number; w: number; l: number; diff: number; points: number }
export interface AgTable { key: string; title: string; stage: "group" | "second"; rows: AgTableRow[] }

interface TsRow {
  team_id: string; position: number; total?: number; win?: number; loss?: number; points?: number;
  sets_win?: number; sets_loss?: number; goals?: number; goals_against?: number;
}

// "Group A" → "A조", 야구 2라운드("Winners stage"·"Losers stage")
function tableTitle(name: string): { title: string; stage: AgTable["stage"]; key: string } {
  const g = /^Group\s+([A-Z])$/i.exec(name.trim());
  if (g) return { title: `${g[1].toUpperCase()}조`, stage: "group", key: g[1].toUpperCase() };
  if (/winner/i.test(name)) return { title: "승자 라운드", stage: "second", key: "W" };
  if (/loser/i.test(name)) return { title: "패자 라운드", stage: "second", key: "L" };
  return { title: name, stage: "second", key: name };
}

const tsTables = unstable_cache(
  async (sport: string, season: string) => {
    const r = await thesportsGet<{ code: number; results?: { tables?: Array<{ name: string; rows: TsRow[] }> } }>(
      `/v1/${sport}/season/table/detail`, { uuid: season },
    );
    return r.results?.tables ?? [];
  },
  ["ag-multi-ts-tables-v1"],
  { revalidate: 600 },
);

async function loadTables(league: string): Promise<AgTable[]> {
  const cfg = AG_MULTI[league];
  if (cfg.sport === "basketball") {
    const s = await getAgBkStandings(league);
    return (s?.groups ?? []).map((g, i) => ({
      key: String(i + 1), title: `${i + 1}조`, stage: "group" as const,
      rows: g.map((r, j) => ({ teamId: r.teamId, position: j + 1, played: r.w + r.l, w: r.w, l: r.l, diff: r.pf - r.pa, points: r.w })),
    }));
  }
  const raw = await tsTables(cfg.sport, cfg.season!).catch(() => []);
  const src = await prisma.teamSourceId.findMany({ where: { league, source: "thesports" }, select: { externalId: true, teamId: true } });
  const ours = new Map(src.map((s) => [s.externalId, s.teamId]));
  return raw
    .map((t) => {
      const { title, stage, key } = tableTitle(t.name);
      const rows = t.rows.flatMap((r) => {
        const teamId = ours.get(r.team_id);
        if (teamId == null) return [];
        const volley = cfg.sport === "volleyball";
        return [{
          teamId, position: r.position, played: r.total ?? 0, w: r.win ?? 0, l: r.loss ?? 0,
          diff: volley ? (r.sets_win ?? 0) - (r.sets_loss ?? 0) : (r.goals ?? 0) - (r.goals_against ?? 0),
          points: volley ? (r.points ?? 0) : (r.win ?? 0),
        }];
      });
      return { key, title, stage, rows: rows.sort((a, b) => a.position - b.position) };
    })
    .filter((t) => t.rows.length > 0)
    .sort((a, b) => (a.stage === b.stage ? a.key.localeCompare(b.key) : a.stage === "group" ? -1 : 1));
}

export interface AgMultiMatch {
  id: number; externalId: string; status: string; startTime: Date;
  homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null;
  homeTeam: { name: string; nameKo: string | null; logoUrl: string | null };
  awayTeam: { name: string; nameKo: string | null; logoUrl: string | null };
  /** 조 표 제목("A조"·"승자 라운드") — 결선이면 null */
  table: string | null;
}
export interface AgMultiHub { tables: AgTable[]; matches: AgMultiMatch[]; ko: KoResult; koIds: Set<number> }

export async function getAgMultiHub(league: string): Promise<AgMultiHub | null> {
  if (!AG_MULTI[league]) return null;
  const [tables, rows] = await Promise.all([
    loadTables(league),
    prisma.match.findMany({
      where: { league },
      orderBy: { startTime: "asc" },
      select: {
        id: true, externalId: true, status: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
        homeTeam: { select: { name: true, nameKo: true, logoUrl: true } },
        awayTeam: { select: { name: true, nameKo: true, logoUrl: true } },
      },
    }),
  ]);
  // 같은 표에 든 두 팀의 k번째 맞대결 = 두 팀이 함께 든 k번째 표의 경기. 그보다 많으면 결선 재대결.
  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const shared = new Map<string, string[]>();
  for (const t of tables) {
    const ids = t.rows.map((r) => r.teamId);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = pairKey(ids[i], ids[j]);
      shared.set(k, [...(shared.get(k) ?? []), t.title]);
    }
  }
  const met = new Map<string, number>();
  const matches: AgMultiMatch[] = rows.map((m) => {
    const k = pairKey(m.homeTeamId, m.awayTeamId);
    const n = met.get(k) ?? 0;
    met.set(k, n + 1);
    return { ...m, table: shared.get(k)?.[n] ?? null };
  });
  const koMatches: KoMatch[] = matches
    .filter((m) => m.table == null)
    .map((m) => ({ id: m.id, startTime: m.startTime.getTime(), homeId: m.homeTeamId, awayId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, finished: m.status === "FINISHED" }));
  // 야구형 — 2라운드 승자조가 있으면 그 1·2위가 결승
  const win2 = tables.find((t) => t.key === "W");
  const finalPair = win2 && win2.rows.length >= 2 ? ([win2.rows[0].teamId, win2.rows[1].teamId] as [number, number]) : null;
  const complete = matches.length > 0 && matches.every((m) => m.status === "FINISHED" || m.status === "CANCELLED");
  const ko = buildKnockout(koMatches, finalPair, { complete, forward: AG_MULTI[league].sport === "basketball" });
  return { tables, matches, ko, koIds: new Set(koMatches.map((m) => m.id)) };
}
