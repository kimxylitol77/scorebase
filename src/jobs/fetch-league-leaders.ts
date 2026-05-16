// 리그별 시즌 리더보드 fetch — 매일 1회 cron.
//
// 데이터 소스:
//   - 축구 7개 리그: API-Football /players/topscorers · topassists · topyellow · topred
//   - NBA: BALLDONTLIE /nba/v1/leaders (pts · ast · reb · stl · blk)
//   - NHL: 공식 NHL API /v1/skater-stats-leaders + /v1/goalie-stats-leaders
//   - MLB: MLB Stats API /v1/stats/leaders (타격 4 + 투구 4)
//   - KBO: koreabaseball.com (시즌 hitter/pitcher basic — ajax JSON)
//   - NPB: npb.jp/bis/{Y}/stats/{bat,pit}_{c,p}.html (양리그 합산 TOP)
//   - LOL/LCK: BALLDONTLIE /lol/v1/player_match_map_stats 시즌 집계 (KDA·CS)

import "@/lib/env";
import axios from "axios";
import * as cheerio from "cheerio";
import { prisma } from "@/lib/db";
import {
  fetchSeasonTopScorers,
  fetchTopAssists,
  fetchTopYellowCards,
  fetchTopRedCards,
  type PlayerLeaderEntry,
  type TopScorerEntry,
} from "@/lib/sports/api-football-pro";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import {
  fetchNpbPlayerIndex,
  findNpbPidByName,
  type NpbPlayerIndexEntry,
} from "@/lib/sports/npb-official";

const TOP_N = 10;

interface UpsertInput {
  league: string;
  category: string;
  rank: number;
  playerName: string;
  playerNameEn?: string;
  externalId?: string;
  teamName: string;
  teamShort?: string;
  value: number;
  unit?: string;
  appearances?: number;
  photoUrl?: string;
  season: string;
}

async function upsertLeader(d: UpsertInput) {
  await prisma.leagueLeader.upsert({
    where: {
      league_category_rank_season: {
        league: d.league,
        category: d.category,
        rank: d.rank,
        season: d.season,
      },
    },
    update: {
      playerName: d.playerName,
      playerNameEn: d.playerNameEn,
      externalId: d.externalId,
      teamName: d.teamName,
      teamShort: d.teamShort,
      value: d.value,
      unit: d.unit,
      appearances: d.appearances,
      photoUrl: d.photoUrl,
      fetchedAt: new Date(),
    },
    create: d,
  });
}

async function clearOldRanks(
  league: string,
  category: string,
  season: string,
  keepFromRank: number,
) {
  await prisma.leagueLeader.deleteMany({
    where: { league, category, season, rank: { gt: keepFromRank } },
  });
}

/* ============================================================
 * 축구 7개 리그 (API-Football)
 * ==========================================================*/

const SOCCER_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "SAUDI_PL",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "CLUB_WORLD_CUP",
];

/** 리그별 시즌 — 달력 연도 (MLS/J/K/AFC) vs 유럽 7-6월. CLUB_WORLD_CUP 은 단일 대회 (2025). */
function currentSoccerSeason(league: string): { season: number; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const calendarYearLeagues = ["MLS", "J1_LEAGUE", "J2_LEAGUE", "K_LEAGUE_1", "K_LEAGUE_2", "AFC_CL", "WORLD_CUP"];
  if (league === "CLUB_WORLD_CUP") return { season: 2025, label: "2025" };
  if (calendarYearLeagues.includes(league)) {
    return { season: y, label: String(y) };
  }
  const startYear = m >= 7 ? y : y - 1;
  return { season: startYear, label: `${startYear}-${String(startYear + 1).slice(2)}` };
}

async function syncSoccerCategory(
  league: string,
  category: "GOAL" | "ASSIST" | "YELLOW" | "RED",
  season: number,
  seasonLabel: string,
  fetcher: (league: string, season: number) => Promise<PlayerLeaderEntry[] | TopScorerEntry[]>,
  unit: string,
): Promise<number> {
  const raw = await fetcher(league, season);
  const top = raw.slice(0, TOP_N);
  for (let i = 0; i < top.length; i++) {
    const p = top[i] as PlayerLeaderEntry & { goals?: number };
    const value =
      category === "GOAL" && "goals" in p
        ? p.goals ?? 0
        : (p as PlayerLeaderEntry).value;
    await upsertLeader({
      league,
      category,
      rank: i + 1,
      playerName: toKoreanPlayerName(p.playerName) || p.playerName,
      playerNameEn: p.playerName,
      externalId: p.playerId ? String(p.playerId) : undefined,
      teamName: toKoreanTeamName(p.teamName) || p.teamName,
      value,
      unit,
      appearances: p.appearances,
      photoUrl: p.photoUrl,
      season: seasonLabel,
    });
  }
  await clearOldRanks(league, category, seasonLabel, top.length);
  return top.length;
}

async function runSoccer() {
  const result: Record<string, Record<string, number>> = {};
  let lastLabel = "";
  for (const lg of SOCCER_LEAGUES) {
    const { season, label } = currentSoccerSeason(lg);
    lastLabel = label;
    result[lg] = {};
    try {
      result[lg].GOAL = await syncSoccerCategory(lg, "GOAL", season, label, fetchSeasonTopScorers, "득점");
      result[lg].ASSIST = await syncSoccerCategory(lg, "ASSIST", season, label, fetchTopAssists, "도움");
      result[lg].YELLOW = await syncSoccerCategory(lg, "YELLOW", season, label, fetchTopYellowCards, "옐로");
      result[lg].RED = await syncSoccerCategory(lg, "RED", season, label, fetchTopRedCards, "레드");
    } catch (e) {
      console.warn(`[league-leaders/${lg}]`, (e as Error).message);
    }
  }
  return { season: lastLabel, result };
}

/* ============================================================
 * NBA (BALLDONTLIE)
 * ==========================================================*/

const NBA_CATS = [
  { stat: "pts", code: "PTS", unit: "득점" },
  { stat: "ast", code: "AST", unit: "도움" },
  { stat: "reb", code: "REB", unit: "리바" },
  { stat: "stl", code: "STL", unit: "스틸" },
  { stat: "blk", code: "BLK", unit: "블록" },
] as const;

async function runNba(season: number) {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return { season: String(season), result: {} };
  const summary: Record<string, number> = {};
  // 30팀 lookup
  const teamsRes = await fetch(`https://api.balldontlie.io/nba/v1/teams?per_page=50`, {
    headers: { Authorization: key },
  });
  const teamsData = (await teamsRes.json()) as { data?: Array<{ id: number; full_name: string; abbreviation: string }> };
  const teamById = new Map<number, { fullName: string; abbr: string }>();
  for (const t of teamsData.data ?? []) {
    teamById.set(t.id, { fullName: t.full_name, abbr: t.abbreviation });
  }

  for (const cat of NBA_CATS) {
    try {
      const r = await fetch(
        `https://api.balldontlie.io/nba/v1/leaders?season=${season}&stat_type=${cat.stat}`,
        { headers: { Authorization: key }, cache: "no-store" },
      );
      if (!r.ok) continue;
      const data = (await r.json()) as {
        data: Array<{
          player: { id: number; first_name: string; last_name: string; team_id: number };
          value: number;
          games_played: number;
          rank: number;
        }>;
      };
      const top = data.data.slice(0, TOP_N);
      for (let i = 0; i < top.length; i++) {
        const d = top[i];
        const fullName = `${d.player.first_name} ${d.player.last_name}`.trim();
        const team = teamById.get(d.player.team_id);
        await upsertLeader({
          league: "NBA",
          category: cat.code,
          rank: d.rank,
          playerName: toKoreanPlayerName(fullName) || fullName,
          playerNameEn: fullName,
          externalId: String(d.player.id),
          teamName: toKoreanTeamName(team?.fullName ?? "") || team?.fullName || `Team ${d.player.team_id}`,
          teamShort: team?.abbr,
          value: d.value,
          unit: cat.unit,
          appearances: d.games_played,
          season: String(season),
        });
      }
      await clearOldRanks("NBA", cat.code, String(season), top.length);
      summary[cat.code] = top.length;
    } catch (e) {
      console.warn(`[leaders/nba] ${cat.stat}`, (e as Error).message);
    }
  }
  return { season: String(season), result: summary };
}

/* ============================================================
 * NHL (공식 API)
 * ==========================================================*/

const NHL_SKATER_CATS = [
  { cat: "goals", code: "GOAL_NHL", unit: "골" },
  { cat: "assists", code: "ASSIST_NHL", unit: "도움" },
  { cat: "points", code: "POINTS", unit: "포인트" },
] as const;
const NHL_GOALIE_CATS = [
  { cat: "savePctg", code: "SAVE_PCT", unit: "세이브%" },
] as const;

async function runNhl(seasonLabel: string) {
  const summary: Record<string, number> = {};
  const fetchOne = async (
    base: "skater" | "goalie",
    cats: ReadonlyArray<{ cat: string; code: string; unit: string }>,
  ) => {
    for (const c of cats) {
      try {
        const r = await fetch(
          `https://api-web.nhle.com/v1/${base}-stats-leaders/current?categories=${c.cat}&limit=${TOP_N}`,
          { cache: "no-store" },
        );
        if (!r.ok) continue;
        const data = (await r.json()) as Record<
          string,
          Array<{
            id: number;
            firstName: { default: string };
            lastName: { default: string };
            teamAbbrev: string;
            teamName?: { default: string };
            headshot?: string;
            value: number;
          }>
        >;
        const arr = data[c.cat];
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const p = arr[i];
          const fullName = `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim();
          const team = p.teamName?.default ?? p.teamAbbrev ?? "";
          await upsertLeader({
            league: "NHL",
            category: c.code,
            rank: i + 1,
            playerName: toKoreanPlayerName(fullName) || fullName,
            playerNameEn: fullName,
            externalId: String(p.id),
            teamName: toKoreanTeamName(team) || team,
            teamShort: p.teamAbbrev,
            value: p.value,
            unit: c.unit,
            photoUrl: p.headshot,
            season: seasonLabel,
          });
        }
        await clearOldRanks("NHL", c.code, seasonLabel, arr.length);
        summary[c.code] = arr.length;
      } catch (e) {
        console.warn(`[leaders/nhl-${base}] ${c.cat}`, (e as Error).message);
      }
    }
  };
  await fetchOne("skater", NHL_SKATER_CATS);
  await fetchOne("goalie", NHL_GOALIE_CATS);
  return { season: seasonLabel, result: summary };
}

/* ============================================================
 * MLB (MLB Stats API)
 * ==========================================================*/

const MLB_CATS = [
  { cat: "homeRuns", code: "HR", unit: "홈런", group: "hitting", decimals: 0 },
  { cat: "battingAverage", code: "BA", unit: "타율", group: "hitting", decimals: 3 },
  { cat: "runsBattedIn", code: "RBI", unit: "타점", group: "hitting", decimals: 0 },
  { cat: "stolenBases", code: "SB", unit: "도루", group: "hitting", decimals: 0 },
  { cat: "earnedRunAverage", code: "ERA", unit: "ERA", group: "pitching", decimals: 2 },
  { cat: "wins", code: "WIN", unit: "승", group: "pitching", decimals: 0 },
  { cat: "strikeouts", code: "K", unit: "탈삼진", group: "pitching", decimals: 0 },
  { cat: "saves", code: "SAVE", unit: "세이브", group: "pitching", decimals: 0 },
] as const;

async function runMlb(season: number) {
  const summary: Record<string, number> = {};
  for (const c of MLB_CATS) {
    try {
      const url = `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${c.cat}&season=${season}&sportId=1&limit=${TOP_N}&statGroup=${c.group}&leaderGameTypes=R`;
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = (await r.json()) as {
        leagueLeaders?: Array<{
          leaders?: Array<{
            rank: number;
            value: string;
            person: { id: number; fullName: string };
            team?: { name?: string };
          }>;
        }>;
      };
      const leaders = data.leagueLeaders?.[0]?.leaders ?? [];
      for (const l of leaders.slice(0, TOP_N)) {
        // MLB Stats API 의 person id → 공식 헤드샷 URL 패턴 (213px)
        const photoUrl = l.person.id
          ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${l.person.id}/headshot/67/current`
          : undefined;
        await upsertLeader({
          league: "MLB",
          category: c.code,
          rank: l.rank,
          playerName: toKoreanPlayerName(l.person.fullName) || l.person.fullName,
          playerNameEn: l.person.fullName,
          externalId: String(l.person.id),
          teamName: toKoreanTeamName(l.team?.name ?? "") || l.team?.name || "",
          value: parseFloat(l.value),
          unit: c.unit,
          photoUrl,
          season: String(season),
        });
      }
      await clearOldRanks("MLB", c.code, String(season), leaders.length);
      summary[c.code] = leaders.length;
    } catch (e) {
      console.warn(`[leaders/mlb] ${c.cat}`, (e as Error).message);
    }
  }
  return { season: String(season), result: summary };
}

/* ============================================================
 * KBO (koreabaseball.com 시즌 stat)
 * ==========================================================*/

const KBO_HITTER_URL = "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic1.aspx";
const KBO_HITTER_URL_2 = "https://www.koreabaseball.com/Record/Player/HitterBasic/Basic2.aspx";
const KBO_PITCHER_URL = "https://www.koreabaseball.com/Record/Player/PitcherBasic/Basic1.aspx";

const KBO_HITTER_CATS = [
  { col: "AVG", code: "BA", unit: "타율", decimals: 3, ord: "DESC" },
  { col: "HR", code: "HR", unit: "홈런", decimals: 0, ord: "DESC" },
  { col: "RBI", code: "RBI", unit: "타점", decimals: 0, ord: "DESC" },
  { col: "SB", code: "SB", unit: "도루", decimals: 0, ord: "DESC" },
] as const;
const KBO_PITCHER_CATS = [
  { col: "ERA", code: "ERA", unit: "ERA", decimals: 2, ord: "ASC" },
  { col: "W", code: "WIN", unit: "승", decimals: 0, ord: "DESC" },
  { col: "SO", code: "K", unit: "탈삼진", decimals: 0, ord: "DESC" },
  { col: "SV", code: "SAVE", unit: "세이브", decimals: 0, ord: "DESC" },
] as const;

/** KBO 페이지의 hitter/pitcher 기본 표 — class="tData01 tt". */
async function fetchKboTable(
  url: string,
): Promise<Array<{ rank: number; player: string; team: string; cells: Record<string, string> }>> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return [];
    const html = await r.text();
    const $ = cheerio.load(html);
    // 표는 단순 `table` selector — class="tData01 tt" (확인된 구조)
    const table = $("table").filter((_, t) => $(t).find("tr").length > 5).first();
    if (table.length === 0) return [];
    const headers: string[] = [];
    table.find("tr").first().find("th").each((_, th) => {
      headers.push($(th).text().trim());
    });
    const rows: Array<{ rank: number; player: string; team: string; cells: Record<string, string> }> = [];
    table.find("tr").slice(1).each((_, tr) => {
      const tds = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (tds.length < 4) return;
      const cells: Record<string, string> = {};
      for (let i = 0; i < headers.length && i < tds.length; i++) {
        cells[headers[i]] = tds[i];
      }
      rows.push({
        rank: parseInt(tds[0], 10) || 0,
        player: cells["선수명"] ?? tds[1] ?? "",
        team: cells["팀명"] ?? tds[2] ?? "",
        cells,
      });
    });
    return rows;
  } catch (e) {
    console.warn(`[leaders/kbo] ${url}`, (e as Error).message);
    return [];
  }
}

async function runKbo(season: number) {
  const summary: Record<string, number> = {};
  // Basic1 + Basic2 머지 (Basic2 에 SB·OBP·SLG 등 있음)
  const hitter1 = await fetchKboTable(KBO_HITTER_URL);
  const hitter2 = await fetchKboTable(KBO_HITTER_URL_2);
  // 선수명+팀 key 로 cells 합치기
  const hitter = hitter1.map((row) => {
    const ex = hitter2.find((r2) => r2.player === row.player && r2.team === row.team);
    if (ex) {
      for (const [k, v] of Object.entries(ex.cells)) {
        if (!(k in row.cells)) row.cells[k] = v;
      }
    }
    return row;
  });
  const pitcher = await fetchKboTable(KBO_PITCHER_URL);

  const upsertFrom = async (
    rows: Awaited<ReturnType<typeof fetchKboTable>>,
    cats: typeof KBO_HITTER_CATS | typeof KBO_PITCHER_CATS,
  ) => {
    for (const c of cats) {
      // 값 추출 + 정렬 (페이지의 기본 정렬과 다를 수 있어 우리 쪽 sort)
      const enriched = rows
        .map((row) => {
          const raw = row.cells[c.col];
          if (!raw) return null;
          const v = parseFloat(raw);
          if (Number.isNaN(v)) return null;
          return { row, value: v };
        })
        .filter((x): x is { row: typeof rows[number]; value: number } => x !== null);
      enriched.sort((a, b) => (c.ord === "DESC" ? b.value - a.value : a.value - b.value));
      const top = enriched.slice(0, TOP_N);
      for (let i = 0; i < top.length; i++) {
        const e = top[i];
        await upsertLeader({
          league: "KBO",
          category: c.code,
          rank: i + 1,
          playerName: e.row.player,
          teamName: e.row.team,
          value: e.value,
          unit: c.unit,
          season: String(season),
        });
      }
      await clearOldRanks("KBO", c.code, String(season), top.length);
      summary[c.code] = top.length;
    }
  };
  await upsertFrom(hitter, KBO_HITTER_CATS);
  await upsertFrom(pitcher, KBO_PITCHER_CATS);
  return { season: String(season), result: summary };
}

/* ============================================================
 * NPB (npb.jp 시즌 stat — 센트럴/퍼시픽 합산)
 * ==========================================================*/

const NPB_BAT_PAGES = [
  { url: "https://npb.jp/bis/{Y}/stats/bat_c.html", league: "C" },
  { url: "https://npb.jp/bis/{Y}/stats/bat_p.html", league: "P" },
] as const;
const NPB_PIT_PAGES = [
  { url: "https://npb.jp/bis/{Y}/stats/pit_c.html", league: "C" },
  { url: "https://npb.jp/bis/{Y}/stats/pit_p.html", league: "P" },
] as const;

interface NpbStatRow {
  player: string;
  team: string;
  cells: string[]; // column index 별 값
  headers: string[];
}

async function fetchNpbTable(url: string): Promise<NpbStatRow[]> {
  try {
    const r = await axios.get<string>(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
      responseType: "text",
    });
    const $ = cheerio.load(r.data);
    const rows: NpbStatRow[] = [];
    // npb.jp stats 표: class="bgTable02" 보통
    const table = $("table").filter((_, el) => $(el).find("tr").length > 5).first();
    if (table.length === 0) return [];
    const headers: string[] = [];
    table.find("tr").first().find("th").each((_, th) => {
      headers.push($(th).text().trim());
    });
    table.find("tr").slice(1).each((_, tr) => {
      const cells = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (cells.length < 4) return;
      // npb.jp 표 row 구조: [순위, "선수명(팀약자)", stat1, stat2, ...]
      // (cells[2] 부터 stats — 별도 team 컬럼 없음)
      const raw = cells[1] ?? "";
      const tm = raw.match(/^(.+?)[（(]([^）)]+)[）)]\s*$/);
      const player = tm ? tm[1].trim() : raw;
      const team = tm ? `(${tm[2].trim()})` : "";
      rows.push({ player, team, cells, headers });
    });
    return rows;
  } catch (e) {
    console.warn(`[leaders/npb] ${url}`, (e as Error).message);
    return [];
  }
}

const NPB_TEAM_JP_TO_KOR: Record<string, string> = {
  "(巨)": "요미우리",
  "(神)": "한신",
  "(De)": "요코하마",
  "(広)": "히로시마",
  "(中)": "주니치",
  "(ヤ)": "야쿠르트",
  "(ソ)": "소프트뱅크",
  "(日)": "닛폰햄",
  "(ロ)": "롯데",
  "(オ)": "오릭스",
  "(楽)": "라쿠텐",
  "(西)": "세이부",
};

function findColIdx(headers: string[], targets: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    if (targets.includes(headers[i])) return i;
  }
  return -1;
}

/** npb.jp 의 player profile 에서 사진 URL (p.npb.jp/players_photo/...) 추출. */
async function fetchNpbPhotoUrl(pid: string): Promise<string | undefined> {
  try {
    const r = await fetch(`https://npb.jp/bis/players/${pid}.html`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) return undefined;
    const html = await r.text();
    const m = html.match(/<img[^>]*src="(https?:\/\/p\.npb\.jp\/players_photo\/[^"]+)"/i);
    return m?.[1];
  } catch {
    return undefined;
  }
}

async function runNpb(season: number) {
  const summary: Record<string, number> = {};
  const batRows: NpbStatRow[] = [];
  for (const p of NPB_BAT_PAGES) {
    batRows.push(...(await fetchNpbTable(p.url.replace("{Y}", String(season)))));
  }
  const pitRows: NpbStatRow[] = [];
  for (const p of NPB_PIT_PAGES) {
    pitRows.push(...(await fetchNpbTable(p.url.replace("{Y}", String(season)))));
  }
  // 12팀 roster 인덱스 (한자 → pid 매칭용)
  let npbIndex: NpbPlayerIndexEntry[] = [];
  try {
    npbIndex = await fetchNpbPlayerIndex();
  } catch (e) {
    console.warn("[leaders/npb] roster index 실패:", (e as Error).message);
  }
  const photoCache = new Map<string, string | undefined>();
  const getPhoto = async (pid: string): Promise<string | undefined> => {
    if (photoCache.has(pid)) return photoCache.get(pid);
    const url = await fetchNpbPhotoUrl(pid);
    photoCache.set(pid, url);
    // burst 회피
    await new Promise((r) => setTimeout(r, 200));
    return url;
  };

  const upsertCat = async (
    rows: NpbStatRow[],
    code: string,
    unit: string,
    colTargets: string[],
    ord: "ASC" | "DESC",
  ) => {
    if (rows.length === 0) return;
    const idx = findColIdx(rows[0].headers, colTargets);
    if (idx < 0) return;
    const enriched = rows
      .map((row) => {
        const raw = row.cells[idx];
        if (!raw) return null;
        const v = parseFloat(raw);
        if (Number.isNaN(v)) return null;
        return { row, value: v };
      })
      .filter((x): x is { row: NpbStatRow; value: number } => x !== null);
    enriched.sort((a, b) => (ord === "DESC" ? b.value - a.value : a.value - b.value));
    const top = enriched.slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const e = top[i];
      // 팀명 처리 — 한자/카타카나 → 한국명
      const teamRaw = e.row.team.trim();
      const teamKo = Object.entries(NPB_TEAM_JP_TO_KOR).find(([abbr]) =>
        teamRaw.includes(abbr.replace(/[()]/g, ""))
      )?.[1] ?? teamRaw;
      const playerKo = npbPlayerToKorean(e.row.player);
      // pid 매칭 → photo URL
      const cleanedName = e.row.player.replace(/[（(].+?[）)]/g, "").trim();
      const idx = npbIndex.length > 0 ? findNpbPidByName(npbIndex, cleanedName) : null;
      const photoUrl = idx ? await getPhoto(idx.pid) : undefined;
      await upsertLeader({
        league: "NPB",
        category: code,
        rank: i + 1,
        playerName: playerKo,
        playerNameEn: e.row.player,
        externalId: idx?.pid,
        teamName: teamKo,
        value: e.value,
        unit,
        photoUrl,
        season: String(season),
      });
    }
    await clearOldRanks("NPB", code, String(season), top.length);
    summary[code] = top.length;
  };

  await upsertCat(batRows, "BA", "타율", ["打率", "AVG"], "DESC");
  await upsertCat(batRows, "HR", "홈런", ["本塁打", "HR"], "DESC");
  await upsertCat(batRows, "RBI", "타점", ["打点", "RBI"], "DESC");
  await upsertCat(batRows, "SB", "도루", ["盗塁", "SB"], "DESC");
  await upsertCat(pitRows, "ERA", "ERA", ["防御率", "ERA"], "ASC");
  await upsertCat(pitRows, "WIN", "승", ["勝利", "W"], "DESC");
  await upsertCat(pitRows, "K", "탈삼진", ["三振", "奪三振", "K", "SO"], "DESC");
  await upsertCat(pitRows, "SAVE", "세이브", ["セーブ", "S", "SV"], "DESC");

  return { season: String(season), result: summary };
}

/* ============================================================
 * LOL/LCK (BALLDONTLIE 매치 stats 집계)
 * ==========================================================*/

const LCK_TOURNAMENT_ID = 324;

interface LolMatchMapStat {
  player: { id: number; nickname: string };
  team: { id: number; name: string };
  kills: number;
  deaths: number;
  assists: number;
  creep_score: number;
}

async function fetchLolMatchStats(dateFrom: string): Promise<LolMatchMapStat[]> {
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) return [];
  const all: LolMatchMapStat[] = [];
  let cursor: number | undefined;
  // 최대 20페이지 (각 페이지 100건) — 시즌 게임 ~수백
  for (let i = 0; i < 20; i++) {
    try {
      const url = new URL("https://api.balldontlie.io/lol/v1/player_match_map_stats");
      url.searchParams.set("dates[]", dateFrom);
      url.searchParams.set("tournament_ids[]", String(LCK_TOURNAMENT_ID));
      url.searchParams.set("per_page", "100");
      if (cursor) url.searchParams.set("cursor", String(cursor));
      const r = await fetch(url.toString(), {
        headers: { Authorization: key },
        cache: "no-store",
      });
      if (!r.ok) break;
      const data = (await r.json()) as {
        data: LolMatchMapStat[];
        meta?: { next_cursor?: number };
      };
      all.push(...data.data);
      if (!data.meta?.next_cursor) break;
      cursor = data.meta.next_cursor;
    } catch {
      break;
    }
  }
  return all;
}

async function runLol(season: number) {
  // 시즌 시작 (대략 1월) ~ 현재
  const from = `${season}-01-01`;
  const stats = await fetchLolMatchStats(from);
  const summary: Record<string, number> = {};
  if (stats.length === 0) return { season: String(season), result: summary };

  // player_id 별 집계
  const byPlayer = new Map<number, {
    nickname: string;
    team: string;
    kills: number;
    deaths: number;
    assists: number;
    cs: number;
    games: number;
  }>();
  for (const s of stats) {
    const cur = byPlayer.get(s.player.id) ?? {
      nickname: s.player.nickname,
      team: s.team?.name ?? "",
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      games: 0,
    };
    cur.kills += s.kills ?? 0;
    cur.deaths += s.deaths ?? 0;
    cur.assists += s.assists ?? 0;
    cur.cs += s.creep_score ?? 0;
    cur.games += 1;
    cur.team = s.team?.name ?? cur.team;
    byPlayer.set(s.player.id, cur);
  }

  // 평균 stats 계산 (최소 3게임 이상 출전)
  type Row = { id: number; nickname: string; team: string; kda: number; cs: number; killsAvg: number; games: number };
  const rows: Row[] = [];
  for (const [id, v] of byPlayer) {
    if (v.games < 3) continue;
    const kda = v.deaths === 0 ? v.kills + v.assists : (v.kills + v.assists) / v.deaths;
    rows.push({
      id,
      nickname: v.nickname,
      team: v.team,
      kda,
      cs: v.cs / v.games,
      killsAvg: v.kills / v.games,
      games: v.games,
    });
  }

  const writeCat = async (
    code: string,
    unit: string,
    key: keyof Row,
    decimals: number,
  ) => {
    const sorted = [...rows].sort((a, b) => (b[key] as number) - (a[key] as number));
    const top = sorted.slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const r = top[i];
      await upsertLeader({
        league: "LOL",
        category: code,
        rank: i + 1,
        playerName: r.nickname,
        externalId: String(r.id),
        teamName: r.team,
        value: r[key] as number,
        unit,
        appearances: r.games,
        season: String(season),
      });
    }
    await clearOldRanks("LOL", code, String(season), top.length);
    summary[code] = top.length;
    void decimals; // 표시 자릿수는 컴포넌트가 처리
  };

  await writeCat("KDA", "KDA", "kda", 2);
  await writeCat("CS", "CS", "cs", 1);
  await writeCat("KILL", "킬/경기", "killsAvg", 1);
  return { season: String(season), result: summary };
}

/* ============================================================
 * Entry
 * ==========================================================*/

export async function runFetchLeagueLeaders() {
  const now = new Date();
  const yearNow = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // NBA 시즌은 가을(10월) 시작 — 1~8월이면 직전 시즌이 진행 중
  const nbaSeason = m >= 9 ? yearNow : yearNow - 1;
  // NHL 시즌도 가을 시작 (라벨용)
  const nhlSeasonStartYear = m >= 9 ? yearNow : yearNow - 1;
  const nhlSeasonLabel = `${nhlSeasonStartYear}-${String(nhlSeasonStartYear + 1).slice(2)}`;
  const summary: Record<string, unknown> = {};
  summary.soccer = await runSoccer();
  summary.nba = await runNba(nbaSeason);
  summary.nhl = await runNhl(nhlSeasonLabel);
  summary.mlb = await runMlb(yearNow);
  summary.kbo = await runKbo(yearNow);
  summary.npb = await runNpb(yearNow);
  summary.lol = await runLol(yearNow);
  return summary;
}
