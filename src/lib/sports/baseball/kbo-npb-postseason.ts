// KBO·NPB 포스트시즌 대진표 조회 — 공식 순위표(ts 캐시) + 가을 경기(KBO = 우리 Match, NPB = npb.jp 일정) + 자체 Elo, 5분 캐시.
// 조립 규칙은 ladder-postseason.ts(순수 함수).
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { matchLiveHref } from "@/lib/links/match-live-link";
import { fetchBaseballTable, npbDivisionKo } from "@/lib/sports/thesports/baseball-table";
import { buildLadder, postseasonGames, REGULAR_GAMES, type LadderLeague, type LadderModel, type PsGameIn, type StandRow } from "./ladder-postseason";
import { isNpbPostseasonGame, NPB_JP_TEAM_ID, NPB_SHORT_KO, parseNpbSchedule } from "./npb-schedule";

export interface LadderPage {
  model: LadderModel;
  logoById: Record<number, string>;
  asOf: string;
}

/** KBO·NPB 는 달력 연도 시즌 */
export const ladderSeason = (now = new Date()) => now.getUTCFullYear();

const STATE: Record<string, PsGameIn["state"] | undefined> = { FINISHED: "FINAL", LIVE: "LIVE", SCHEDULED: "SCHEDULED" };

async function npbGames(season: number, regularDone: boolean): Promise<PsGameIn[]> {
  const out: PsGameIn[] = [];
  const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(5, 10).replace("-", "");
  for (const month of [9, 10, 11]) {
    const res = await fetch(`https://npb.jp/games/${season}/schedule_${String(month).padStart(2, "0")}_detail.html`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128 Safari/537.36" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!res?.ok) continue; // 아직 안 올라온 달은 404
    for (const g of parseNpbSchedule(await res.text())) {
      if (!isNpbPostseasonGame(g, regularDone)) continue;
      const homeId = NPB_JP_TEAM_ID[g.homeJp], awayId = NPB_JP_TEAM_ID[g.awayJp];
      if (!homeId || !awayId) continue;
      const scored = g.homeScore != null && g.awayScore != null;
      // 점수가 있으면 지난 날짜는 종료, 오늘은 진행 중으로 본다(일정 표에 종료 표시가 따로 없다)
      const state: PsGameIn["state"] = !scored ? "SCHEDULED" : g.mmdd < todayJst ? "FINAL" : "LIVE";
      const [hh, mm] = (g.time ?? "18:00").split(":").map(Number);
      const date = new Date(Date.UTC(season, Number(g.mmdd.slice(0, 2)) - 1, Number(g.mmdd.slice(2)), hh - 9, mm)).toISOString();
      out.push({ id: g.path ?? `${g.mmdd}-${homeId}-${awayId}`, date, homeId, awayId, homeScore: g.homeScore, awayScore: g.awayScore, state, href: g.path ? `https://npb.jp${g.path}` : null });
    }
  }
  return out;
}

async function load(league: LadderLeague, season: number): Promise<LadderPage | null> {
  const rows = await fetchBaseballTable(league);
  if (rows.length === 0) return null;
  const teams = await prisma.team.findMany({ where: { id: { in: rows.map((r) => r.ourTeamId) } }, select: { id: true, name: true, logoUrl: true } });
  const nameOf = (id: number) => (league === "NPB" ? NPB_SHORT_KO[id] : undefined) ?? teams.find((t) => t.id === id)?.name.split(" ")[0] ?? String(id);
  const table: StandRow[] = rows.map((r) => ({
    teamId: r.ourTeamId, name: nameOf(r.ourTeamId), group: league === "NPB" ? npbDivisionKo(r.division) : "",
    position: r.position, wins: r.wins, draws: r.draws, losses: r.losses, played: r.played,
  }));

  // Elo — 지난 시즌 3월부터(시즌 초 1500 리셋 방지, MLB 대진표와 같은 창)
  const matches = await prisma.match.findMany({
    where: { league, startTime: { gte: new Date(Date.UTC(season - 1, 2, 1)) } },
    select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true, externalId: true },
  });
  const elo = calcEloTable(matches);

  const regularDone = table.every((r) => r.played >= REGULAR_GAMES[league]);
  let games: PsGameIn[];
  if (league === "KBO") {
    const seasonGames: PsGameIn[] = matches
      .filter((m) => m.startTime >= new Date(Date.UTC(season, 1, 1)) && STATE[m.status])
      .map((m) => ({
        id: String(m.id), date: m.startTime.toISOString(), homeId: m.homeTeamId, awayId: m.awayTeamId,
        homeScore: m.homeScore, awayScore: m.awayScore, state: STATE[m.status]!, href: matchLiveHref("KBO", m.externalId),
      }));
    const seeded = new Set([...table].sort((a, b) => a.position - b.position).slice(0, 5).map((r) => r.teamId));
    games = postseasonGames(seasonGames, table, seeded, REGULAR_GAMES.KBO);
  } else {
    games = await npbGames(season, regularDone);
  }

  const model = buildLadder(league, season, table, games, { eloOf: (id) => getElo(elo, id) });
  const logoById: Record<number, string> = {};
  for (const t of teams) if (t.logoUrl) logoById[t.id] = t.logoUrl;
  return { model, logoById, asOf: new Date().toISOString() };
}

export const getLadderPostseason = unstable_cache(
  async (league: LadderLeague, season: number) => {
    try {
      return await load(league, season);
    } catch (e) {
      console.warn(`[${league}-postseason] 조회 실패:`, (e as Error).message);
      return null;
    }
  },
  ["ladder-postseason-v1"],
  { revalidate: 300 },
);
