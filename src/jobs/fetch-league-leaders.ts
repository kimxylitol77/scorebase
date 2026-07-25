// 리그별 시즌 리더보드 fetch — 매일 1회 cron.
//
// 데이터 소스:
//   - 축구 클럽리그(커버): data/player-season-stats.json (TheSports 시즌통계) — 소스 1순위 원칙
//   - 축구 그 외(UCL·UEL·컵 등 season-stats 미커버): API-Football topscorers 등 fallback
//   - 월드컵: TheSports 집계 (getWorldCupPlayerStats)
//   - NBA: ESPN unofficial site v3 /leaders (경기당 pts · ast · reb · stl · blk — BDL plan 401 로 전환)
//   - NHL: 공식 NHL API /v1/skater-stats-leaders + /v1/goalie-stats-leaders
//   - MLB: MLB Stats API /v1/stats/leaders (타격 4 + 투구 4)
//   - KBO: koreabaseball.com (시즌 hitter/pitcher basic — ajax JSON)
//   - NPB: npb.jp/bis/{Y}/stats/{bat,pit}_{c,p}.html (양리그 합산 TOP)
//   - LOL/LCK: BALLDONTLIE /lol/v1/player_match_map_stats 시즌 집계 (KDA·CS)

import "@/lib/env";
import { readFileSync } from "fs";
import path from "path";
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
import { lookupNbaPlayer } from "@/lib/sports/nba-players";
import { npbPlayerToKorean } from "@/lib/sports/npb-player-names";
import {
  fetchNpbPlayerIndex,
  findNpbPidByName,
  type NpbPlayerIndexEntry,
} from "@/lib/sports/npb-official";
import { getWorldCupPlayerStats } from "@/lib/sports/thesports/world-cup-player-stats";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";

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

/** 다른 시즌 레이블로 저장된 잔존 행 제거 (NHL "2026-27" 같은 stale 시즌). */
async function clearStaleSeasons(league: string, currentSeason: string) {
  const res = await prisma.leagueLeader.deleteMany({
    where: { league, season: { not: currentSeason } },
  });
  if (res.count > 0) {
    console.log(`[leaders/${league}] removed ${res.count} stale rows (season !== ${currentSeason})`);
  }
}

/* ============================================================
 * 축구 클럽리그 (TheSports 시즌통계 = data/player-season-stats.json)
 *
 * api-football 키 만료(2026-07)로 클럽리그 리더를 TheSports 시즌통계로 이관.
 * predictions/[league] 가 이미 빅5 리더보드에 쓰는 것과 동일 소스·동일 이름 규칙.
 * - externalId 는 af id 우선(tsPlayerToAf) — 매핑 없으면 ts id. ballon 병합·평점 조회 위해.
 * - 저장 시즌 라벨은 데이터 자체의 s.season 사용 → 8월 2026-27 전환 시 자동 정합.
 *   (2025-26 최종 데이터는 clearStaleSeasons 미호출로 프리즈 → ballon 심사창 보존.)
 * - 커버리지가 충분한 리그만(allowlist), 그중 카테고리당 리더 <5 면 skip → 기존 데이터 보존.
 * - season-stats 미커버 리그(UCL/UEL/컵 등)는 순회 대상이 아니므로 기존 행 그대로 유지.
 * ==========================================================*/

// 리더 발행 대상 축구 리그 전체. season-stats 커버 리그는 ts, 나머지는 api-football fallback.
const SOCCER_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE", "AFC_CL", "AFC_CL_TWO", "AFC_U23", "SAUDI_PL",
  "UEL", "UECL",
  "CHAMPIONSHIP", "LALIGA_2", "BUNDESLIGA_2", "SERIE_B", "LIGUE_2",
  "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "JUPILER_PL", "SPL", "GREEK_SL",
  "BRASILEIRAO", "LIGA_MX", "COPA_LIB", "COPA_SUD",
  "CSL", "A_LEAGUE",
  "CLUB_WORLD_CUP",
];

// season-stats 커버리지가 충분한 클럽리그 (≥30명). PRIMEIRA/EREDIVISIE/J1 등 표본이 얕은
// 리그는 "리그 득점왕"이 부정확할 수 있어 제외 → api-football fallback 이 담당.
const SEASON_STATS_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "K_LEAGUE_1", "K_LEAGUE_2", "LALIGA_2", "MLS", "SAUDI_PL",
  "BRASILEIRAO", "SERIE_B", "BUNDESLIGA_2", "SUPER_LIG",
]);

/** 리그별 시즌. 단일 대회 → 마지막 개최 연도, 달력 연도 vs 유럽 8-5월 시즌. */
function currentSoccerSeason(league: string): { season: number; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const calendarYearLeagues = [
    "MLS", "J1_LEAGUE", "J2_LEAGUE", "K_LEAGUE_1", "K_LEAGUE_2", "AFC_CL", "WORLD_CUP",
    "BRASILEIRAO", "COPA_LIB", "COPA_SUD", "CSL",
  ];
  if (league === "CLUB_WORLD_CUP") return { season: 2025, label: "2025" };
  if (league === "AFC_U23") return { season: 2025, label: "2025" };
  if (calendarYearLeagues.includes(league)) {
    return { season: y, label: String(y) };
  }
  // UEFA 컨티넨탈 컵(UCL/UEL/UECL)은 본대회(리그 페이즈) 9월 개막. 7~8월 예선 득점자를
  // 새 시즌으로 적재하면 완료된 직전 시즌 리더보드를 최다 2골짜리 예선 데이터가 밀어낸다
  // (2026-07 UCL 리더보드가 예선 득점판으로 뒤바뀐 실측). 컵만 전환을 9월로 늦춘다.
  const CONTINENTAL_CUPS = ["UCL", "UEL", "UECL"];
  const seasonStartMonth = CONTINENTAL_CUPS.includes(league) ? 9 : 7;
  const startYear = m >= seasonStartMonth ? y : y - 1;
  return { season: startYear, label: `${startYear}-${String(startYear + 1).slice(2)}` };
}

// api-football 리더 적재 (season-stats 미커버 리그). 새 시즌 개막 전이면 raw=0 →
// clearOldRanks 가 새 라벨에서만 동작해 기존 최종 데이터는 그대로 보존된다.
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
      category === "GOAL" && "goals" in p ? p.goals ?? 0 : (p as PlayerLeaderEntry).value;
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

// 카테고리별 리더가 이 수 미만이면 커버리지 부족으로 보고 skip (기존 데이터 보존).
const MIN_LEADERS = 5;

interface SeasonStatRow {
  lg: string;
  season: string;
  team: string | null;
  goals: number | null;
  assists: number | null;
  yellow: number | null;
  red: number | null;
  matches: number | null;
  rating: number | null;
}
type PlayerNameOverride = { nameKo?: string };

let seasonStatsCache: Record<string, SeasonStatRow> | null = null;
let playerPhotosCache: Record<string, string> | null = null;
let playerOverridesCache: Record<string, PlayerNameOverride> | null = null;
function loadJson<T>(rel: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), rel), "utf-8")) as T;
}
function loadJsonSafe<T>(rel: string, fallback: T): T {
  try {
    return loadJson<T>(rel);
  } catch {
    return fallback;
  }
}
function seasonStats(): Record<string, SeasonStatRow> {
  return (seasonStatsCache ??= loadJson<Record<string, SeasonStatRow>>("data/player-season-stats.json"));
}
function playerPhotos(): Record<string, string> {
  return (playerPhotosCache ??= loadJsonSafe("data/player-photos.json", {}));
}
function playerOverrides(): Record<string, PlayerNameOverride> {
  return (playerOverridesCache ??= loadJsonSafe("data/player-overrides.json", {}));
}

const SOCCER_CATS: Array<{ cat: "GOAL" | "ASSIST" | "YELLOW" | "RED"; key: "goals" | "assists" | "yellow" | "red"; unit: string }> = [
  { cat: "GOAL", key: "goals", unit: "골" },
  { cat: "ASSIST", key: "assists", unit: "도움" },
  { cat: "YELLOW", key: "yellow", unit: "장" },
  { cat: "RED", key: "red", unit: "장" },
];

/** 한 클럽리그의 리더보드를 season-stats 로 적재. 카테고리별 <5 면 skip(기존 보존). */
async function syncClubLeagueFromSeasonStats(league: string): Promise<Record<string, number>> {
  const stats = seasonStats();
  const entries = Object.entries(stats).filter(([, s]) => s.lg === league);
  const out: Record<string, number> = {};
  if (entries.length === 0) return out;

  // 리그 시즌 라벨 — 행마다 동일하나 최빈값으로 방어.
  const seasonCount = new Map<string, number>();
  for (const [, s] of entries) seasonCount.set(s.season, (seasonCount.get(s.season) ?? 0) + 1);
  const seasonLabel = [...seasonCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // 카테고리별 상위 계산 (값 내림차순, 평점 tiebreak — WC 패턴과 동일).
  const tops = SOCCER_CATS.map(({ cat, key, unit }) => ({
    cat, key, unit,
    top: entries
      .filter(([, s]) => (s[key] ?? 0) > 0)
      .sort((a, b) => (b[1][key] ?? 0) - (a[1][key] ?? 0) || (b[1].rating ?? 0) - (a[1].rating ?? 0))
      .slice(0, TOP_N),
  }));

  // 이름 배치 조회 (TheSportsPlayer DB). 상위 등장 id 합집합.
  const ids = [...new Set(tops.flatMap((c) => c.top.map(([id]) => id)))];
  const lp = ids.length
    ? await prisma.theSportsPlayer.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, nameKo: true } })
    : [];
  const nm = new Map(lp.map((p) => [p.id, p]));
  const ov = playerOverrides();
  const photos = playerPhotos();
  const nameOf = (id: string) => ov[id]?.nameKo || nm.get(id)?.nameKo || nm.get(id)?.name || "(미상)";

  for (const { cat, unit, key, top } of tops) {
    // 커버리지 부족 → 기존 데이터 보존 (upsert·clearOldRanks 모두 skip).
    if (top.length < MIN_LEADERS) continue;
    for (let i = 0; i < top.length; i++) {
      const [id, s] = top[i];
      const af = tsPlayerToAf(id);
      await upsertLeader({
        league,
        category: cat,
        rank: i + 1,
        playerName: nameOf(id),
        playerNameEn: nm.get(id)?.name ?? undefined,
        externalId: af ? String(af) : id,
        teamName: toKoreanTeamName(s.team ?? "", league) || s.team || "",
        value: s[key] ?? 0,
        unit,
        appearances: s.matches ?? undefined,
        photoUrl: photos[id] || undefined,
        season: seasonLabel,
      });
    }
    await clearOldRanks(league, cat, seasonLabel, top.length);
    out[cat] = top.length;
  }
  return out;
}

// 월드컵 리더 = TheSports 집계(getWorldCupPlayerStats) 소스. api-football 은 월드컵 시즌 미제공/키
// 의존이라 사라짐(/ballon 월드컵 반복 소실 원인) → 이미 보유한 TheSports 데이터로 직접 적재.
// externalId 는 af id 우선(클럽 리그 리더와 병합·ballon 평점 조회 위해), 매핑 없으면 ts id.
async function syncWorldCupFromTheSports(seasonLabel: string): Promise<Record<string, number>> {
  const stats = await getWorldCupPlayerStats();
  const cats: Array<{ cat: "GOAL" | "ASSIST" | "YELLOW" | "RED"; unit: string; val: (s: (typeof stats)[number]) => number }> = [
    { cat: "GOAL", unit: "골", val: (s) => s.goals },
    { cat: "ASSIST", unit: "도움", val: (s) => s.assists },
    { cat: "YELLOW", unit: "장", val: (s) => s.yellow },
    { cat: "RED", unit: "장", val: (s) => s.red },
  ];
  const out: Record<string, number> = {};
  for (const c of cats) {
    const top = stats
      .filter((s) => c.val(s) > 0)
      .sort((a, b) => c.val(b) - c.val(a) || b.avgRating - a.avgRating)
      .slice(0, TOP_N);
    for (let i = 0; i < top.length; i++) {
      const s = top[i];
      const af = tsPlayerToAf(s.id);
      await upsertLeader({
        league: "WORLD_CUP",
        category: c.cat,
        rank: i + 1,
        playerName: s.name, // 이미 한글 우선
        playerNameEn: s.nameEn ?? undefined,
        externalId: af ? String(af) : s.id,
        teamName: toKoreanTeamName(s.country) || s.country,
        value: c.val(s),
        unit: c.unit,
        appearances: s.games,
        photoUrl: s.photo ?? undefined,
        season: seasonLabel,
      });
    }
    await clearOldRanks("WORLD_CUP", c.cat, seasonLabel, top.length);
    out[c.cat] = top.length;
  }
  return out;
}

async function runSoccer() {
  const result: Record<string, Record<string, number>> = {};
  for (const lg of SOCCER_LEAGUES) {
    result[lg] = {};
    try {
      // 월드컵 = TheSports 집계 (api-football 미제공 → /ballon 월드컵 소실 방지).
      if (lg === "WORLD_CUP") {
        result[lg] = await syncWorldCupFromTheSports(currentSoccerSeason(lg).label);
        continue;
      }
      // TheSports 시즌통계 커버 리그 = ts 우선 (데이터 소스 1순위 원칙).
      if (SEASON_STATS_LEAGUES.has(lg)) {
        result[lg] = await syncClubLeagueFromSeasonStats(lg);
        continue;
      }
      // 나머지(UCL·UEL·컵·에레디비시 등) = api-football fallback. ts 시즌통계 미커버라 이게 유일 소스.
      const { season, label } = currentSoccerSeason(lg);
      result[lg].GOAL = await syncSoccerCategory(lg, "GOAL", season, label, fetchSeasonTopScorers, "득점");
      result[lg].ASSIST = await syncSoccerCategory(lg, "ASSIST", season, label, fetchTopAssists, "도움");
      result[lg].YELLOW = await syncSoccerCategory(lg, "YELLOW", season, label, fetchTopYellowCards, "옐로");
      result[lg].RED = await syncSoccerCategory(lg, "RED", season, label, fetchTopRedCards, "레드");
    } catch (e) {
      console.warn(`[league-leaders/${lg}]`, (e as Error).message);
    }
  }
  return { result };
}

/* ============================================================
 * NBA (ESPN unofficial site v3 leaders)
 * ==========================================================*/

// ESPN category name → 우리 카테고리 코드. value 는 경기당 평균 (프론트 decimals:1).
const NBA_CATS = [
  { espn: "pointsPerGame", code: "PTS", unit: "득점" },
  { espn: "assistsPerGame", code: "AST", unit: "도움" },
  { espn: "reboundsPerGame", code: "REB", unit: "리바" },
  { espn: "stealsPerGame", code: "STL", unit: "스틸" },
  { espn: "blocksPerGame", code: "BLK", unit: "블록" },
] as const;

interface EspnNbaLeaderEntry {
  value: number;
  athlete?: {
    displayName?: string;
    fullName?: string;
    headshot?: { href?: string };
  };
  team?: { displayName?: string; abbreviation?: string };
}

export async function runNba(seasonStartYear: number) {
  const seasonLabel = `${seasonStartYear}-${String(seasonStartYear + 1).slice(2)}`;
  const summary: Record<string, number> = {};
  // ESPN season 파라미터는 시즌 종료 연도 (2026-27 → 2027). seasontype=2 = 정규시즌
  // (생략 시 포스트시즌 중엔 플레이오프 리더가 나옴). 오프시즌에 미래 시즌 요청 시
  // categories 빈 배열 → 아래서 자연 skip.
  const espnSeason = seasonStartYear + 1;
  try {
    const r = await fetch(
      `https://site.api.espn.com/apis/site/v3/sports/basketball/nba/leaders?season=${espnSeason}&seasontype=2`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) },
    );
    if (!r.ok) {
      console.warn(`[leaders/nba] ESPN leaders HTTP ${r.status} — skip`);
      return { season: seasonLabel, result: summary };
    }
    const data = (await r.json()) as {
      requestedSeason?: { year?: number };
      leaders?: { categories?: Array<{ name: string; leaders?: EspnNbaLeaderEntry[] }> };
    };
    // 응답 시즌이 요청과 다르면(폴백) 이전 시즌 데이터가 새 라벨로 저장되는 사고 방지
    if (data.requestedSeason?.year && data.requestedSeason.year !== espnSeason) {
      console.warn(`[leaders/nba] season mismatch: requested ${espnSeason}, got ${data.requestedSeason.year} — skip`);
      return { season: seasonLabel, result: summary };
    }
    const categories = data.leaders?.categories ?? [];
    for (const cat of NBA_CATS) {
      const top = (categories.find((c) => c.name === cat.espn)?.leaders ?? []).slice(0, TOP_N);
      for (let i = 0; i < top.length; i++) {
        const d = top[i];
        const fullName = (d.athlete?.displayName ?? d.athlete?.fullName ?? "").trim();
        if (!fullName) continue;
        // /players/[pid]?league=NBA 는 BDL id 기대 → 정적 사전(nba-players.json)으로 역매핑
        const bdlId = lookupNbaPlayer(fullName)?.bdlId;
        await upsertLeader({
          league: "NBA",
          category: cat.code,
          rank: i + 1,
          playerName: toKoreanPlayerName(fullName) || fullName,
          playerNameEn: fullName,
          externalId: bdlId != null ? String(bdlId) : undefined,
          teamName: toKoreanTeamName(d.team?.displayName ?? "") || d.team?.displayName || "",
          teamShort: d.team?.abbreviation,
          value: d.value,
          unit: cat.unit,
          season: seasonLabel,
          photoUrl: d.athlete?.headshot?.href,
        });
      }
      if (top.length > 0) {
        await clearOldRanks("NBA", cat.code, seasonLabel, top.length);
      }
      summary[cat.code] = top.length;
    }
  } catch (e) {
    console.warn("[leaders/nba] ESPN leaders", (e as Error).message);
  }
  // 오프시즌 빈 응답이면 삭제 없이 skip — 데이터 확보 시에만 stale 시즌 정리
  if (Object.values(summary).some((n) => n > 0)) {
    await clearStaleSeasons("NBA", seasonLabel);
  }
  return { season: seasonLabel, result: summary };
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
  // NBA 와 동일 — 빈 결과 run 이 직전 시즌 리더보드를 지우지 않게 가드
  if (Object.values(summary).some((n) => n > 0)) {
    await clearStaleSeasons("NHL", seasonLabel);
  }
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

/** KBO 페이지의 hitter/pitcher 기본 표 — class="tData01 tt".
 *  player anchor 의 `playerId={id}` 도 함께 추출 (사진 URL 빌드용). */
async function fetchKboTable(
  url: string,
): Promise<Array<{ rank: number; player: string; team: string; playerId: string | null; cells: Record<string, string> }>> {
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
    const rows: Array<{ rank: number; player: string; team: string; playerId: string | null; cells: Record<string, string> }> = [];
    table.find("tr").slice(1).each((_, tr) => {
      const $tr = $(tr);
      const tds = $tr.find("td").map((_, td) => $(td).text().trim()).get();
      if (tds.length < 4) return;
      const cells: Record<string, string> = {};
      for (let i = 0; i < headers.length && i < tds.length; i++) {
        cells[headers[i]] = tds[i];
      }
      // 선수명 셀 안의 anchor href 에서 playerId 추출
      const href = $tr.find("a[href*='playerId=']").first().attr("href") ?? "";
      const idMatch = href.match(/playerId=(\d+)/);
      const playerId = idMatch ? idMatch[1] : null;
      rows.push({
        rank: parseInt(tds[0], 10) || 0,
        player: cells["선수명"] ?? tds[1] ?? "",
        team: cells["팀명"] ?? tds[2] ?? "",
        playerId,
        cells,
      });
    });
    return rows;
  } catch (e) {
    console.warn(`[leaders/kbo] ${url}`, (e as Error).message);
    return [];
  }
}

/** KBO 공식 선수 사진 CDN URL (네이버 클라우드 edge). */
function kboPhotoUrl(playerId: string | null | undefined, season: number): string | undefined {
  if (!playerId) return undefined;
  return `https://6ptotvmi5753.edge.naverncp.com/KBO_IMAGE/person/middle/${season}/${playerId}.jpg`;
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
          externalId: e.row.playerId ?? undefined,
          photoUrl: kboPhotoUrl(e.row.playerId, season),
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
  "(デ)": "요코하마", // npb.jp 실표기는 가타카나 デ — 라틴 De 만 있던 매핑 miss (2026-06-12)
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

// LCK 1군 10팀 화이트리스트 (BDL 응답 team.name 정확 매치).
// BDL 의 player_match_map_stats endpoint 는 `tournament_ids[]` 필터를 무시해서
// LEC/LJL/KeSPA Cup 등 외부 토너먼트 stat 까지 새므로 client-side 화이트리스트로 차단.
// 2026 시즌 LCK 정규 10팀: T1 · Gen.G · KT · HLE · Dplus KIA · BNK FearX · NS · BRO · DN SOOPers · DRX.
// (Kwangdong Freecs / DN Freecs / DNF 는 후원사 변경 전 명칭이거나 KeSPA Cup 잔여 stat — 통과시키면 안 됨)
const LCK_TEAM_WHITELIST = new Set([
  "T1",
  "Gen.G",
  "KT Rolster",
  "Hanwha Life Esports",
  "Dplus KIA",
  "Hanjin BRION", "BRION", "OK BRION",
  "BNK FearX", "BNK FEARX",
  "DRX",
  "Nongshim RedForce", "NongShim RedForce",
  "DN SOOPers",
]);

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

  // 평균 stats 계산 (최소 3게임 이상 + LCK 1군 화이트리스트만)
  type Row = { id: number; nickname: string; team: string; kda: number; cs: number; killsAvg: number; games: number };
  const rows: Row[] = [];
  let droppedNonLck = 0;
  for (const [id, v] of byPlayer) {
    if (v.games < 3) continue;
    if (!LCK_TEAM_WHITELIST.has(v.team)) { droppedNonLck++; continue; }
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
  if (droppedNonLck > 0) {
    console.log(`[leaders/lol] dropped ${droppedNonLck} non-LCK players (Academy/Youth/해외 리그)`);
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
  // NBA 와 동일 — 빈 결과 run 이 직전 시즌 리더보드를 지우지 않게 가드
  if (Object.values(summary).some((n) => n > 0)) {
    await clearStaleSeasons("LOL", String(season));
  }
  return { season: String(season), result: summary };
}

/* ============================================================
 * Entry
 * ==========================================================*/

export async function runFetchLeagueLeaders(opts?: {
  sport?: "soccer" | "baseball" | "basketball" | "hockey" | "esports";
}) {
  const sport = opts?.sport;
  const now = new Date();
  const yearNow = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // NBA/NHL split 시즌 start year — 7월부터 다음 시즌으로 간주 (preseason 시작).
  // m=7..12 → year, m=1..6 → year-1.
  const nbaSeason = m >= 7 ? yearNow : yearNow - 1;
  const nhlSeasonStartYear = m >= 7 ? yearNow : yearNow - 1;
  const nhlSeasonLabel = `${nhlSeasonStartYear}-${String(nhlSeasonStartYear + 1).slice(2)}`;
  const summary: Record<string, unknown> = {};
  // 종목별 격리 — 한 종목의 unhandled throw (예: 2026-07-01 NBA BDL fetch) 가
  // 이후 종목 전체와 recordCronRun 까지 죽이는 것을 방지
  const errors: string[] = [];
  const safe = async (name: string, fn: () => Promise<unknown>) => {
    try {
      summary[name] = await fn();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
      console.warn(`[league-leaders/${name}]`, (e as Error).message);
    }
  };
  if (!sport || sport === "soccer") await safe("soccer", () => runSoccer());
  if (!sport || sport === "basketball") await safe("nba", () => runNba(nbaSeason));
  if (!sport || sport === "hockey") await safe("nhl", () => runNhl(nhlSeasonLabel));
  if (!sport || sport === "baseball") {
    await safe("mlb", () => runMlb(yearNow));
    await safe("kbo", () => runKbo(yearNow));
    await safe("npb", () => runNpb(yearNow));
  }
  if (!sport || sport === "esports") await safe("lol", () => runLol(yearNow));
  if (errors.length) summary.errors = errors;
  return summary;
}
