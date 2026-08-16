import { load } from "cheerio";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentSeasonStart } from "@/lib/predict/season-window";

export interface BasketballStandingRow {
  position: number;
  ourTeamId: number;
  played: number;
  wins: number;
  losses: number;
  scored: number | null;
  conceded: number | null;
  difference: number | null;
  gamesBehind: number | null;
  teamName?: string;
  shortName?: string;
  logoUrl?: string;
  group?: string;
}

export interface BasketballStandings {
  rows: BasketballStandingRow[];
  updatedAt: Date;
  /** true = 외부 소스가 실패해 마지막 정상 캐시를 돌려준 것. */
  stale?: boolean;
  /** 데이터가 속한 시즌 라벨 (예: "2025-2026") — KBL 폴백·WKBL 시즌코드에서 유도. */
  seasonLabel?: string;
  /** true = 종료된 시즌의 최종 순위 (오프시즌 폴백 표시용). */
  pastSeason?: boolean;
}

/** 리그별 정상 응답 팀 수 — 이보다 적으면 부분 응답으로 보고 캐시에 저장하지 않는다. */
const EXPECTED_TEAMS: Record<string, number> = { NBA: 30 };

export function isCompleteStandings(league: string, rows: BasketballStandingRow[]): boolean {
  const expected = EXPECTED_TEAMS[league];
  return expected == null ? rows.length > 0 : rows.length === expected;
}

const KBL_TEAM_IDS: Record<string, number> = {
  "35": 607775,
  "60": 607776,
  "50": 607777,
  "55": 607778,
  "10": 607779,
  "16": 607780,
  "06": 607781,
  "64": 607782,
  "70": 607783,
  "66": 607784,
};

const WKBL_TEAM_IDS: Array<[RegExp, number]> = [
  [/BNK/, 607785],
  [/신한은행/, 607786],
  [/하나은행/, 607787],
  [/우리은행/, 607788],
  [/삼성생명/, 607789],
  [/KB스타즈|KB\s*스타즈/, 607790],
];

function gamesBehind(leaderWins: number, leaderLosses: number, wins: number, losses: number) {
  const value = Math.max(0, (leaderWins - wins + losses - leaderLosses) / 2);
  return value === 0 ? null : Number(value.toFixed(1));
}

interface EspnNbaStat {
  name?: string;
  value?: number;
}

interface EspnNbaEntry {
  team?: {
    id?: string;
    displayName?: string;
    abbreviation?: string;
    logos?: Array<{ href?: string }>;
  };
  stats?: EspnNbaStat[];
}

interface EspnNbaStandingsPayload {
  children?: Array<{
    name?: string;
    standings?: { entries?: EspnNbaEntry[] };
  }>;
}

function nbaSeasonYear(now = new Date()) {
  return now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

function nbaStat(entry: EspnNbaEntry, name: string) {
  const value = entry.stats?.find((stat) => stat.name === name)?.value;
  return Number.isFinite(value) ? Number(value) : null;
}

export function parseEspnNbaStandings(payload: unknown): BasketballStandingRow[] {
  if (!payload || typeof payload !== "object") return [];
  const children = (payload as EspnNbaStandingsPayload).children;
  if (!Array.isArray(children)) return [];

  return children.flatMap((conference) => {
    const entries = conference.standings?.entries;
    if (!Array.isArray(entries)) return [];
    const group = /eastern/i.test(conference.name ?? "")
      ? "동부 컨퍼런스"
      : /western/i.test(conference.name ?? "")
        ? "서부 컨퍼런스"
        : conference.name?.trim() || "NBA";
    const parsed = entries.flatMap((entry) => {
      const espnId = Number(entry.team?.id);
      const teamName = entry.team?.displayName?.trim();
      const wins = nbaStat(entry, "wins");
      const losses = nbaStat(entry, "losses");
      if (!Number.isInteger(espnId) || !teamName || wins == null || losses == null) return [];
      const played = wins + losses;
      const pointsFor = nbaStat(entry, "pointsFor");
      const pointsAgainst = nbaStat(entry, "pointsAgainst");
      const playoffSeed = nbaStat(entry, "playoffSeed");
      return [{
        playoffSeed,
        row: {
          position: 0,
          // 공개 순위 응답 전용 안정 ID. 오염된 내부 NBA Team 행과 의도적으로 분리한다.
          ourTeamId: 9_000_000 + espnId,
          played,
          wins,
          losses,
          scored: pointsFor,
          conceded: pointsAgainst,
          difference: pointsFor != null && pointsAgainst != null ? pointsFor - pointsAgainst : null,
          gamesBehind: nbaStat(entry, "gamesBehind"),
          teamName,
          shortName: entry.team?.abbreviation?.trim() || undefined,
          logoUrl: entry.team?.logos?.[0]?.href,
          group,
        },
      }];
    });
    // 플레이인 종료 후 playoffSeed는 실제 플레이오프 시드로 변한다.
    // 정규시즌 순위는 승패를 우선하고, 같은 성적일 때만 ESPN 시드를 타이브레이커로 쓴다.
    return parsed
      .sort((left, right) =>
        right.row.wins - left.row.wins
        || left.row.losses - right.row.losses
        || (left.playoffSeed ?? Number.MAX_SAFE_INTEGER) - (right.playoffSeed ?? Number.MAX_SAFE_INTEGER)
        || (right.row.difference ?? 0) - (left.row.difference ?? 0),
      )
      .map(({ row }, index) => ({ ...row, position: index + 1 }));
  });
}

/** 마지막 정상 스냅샷 저장소 — 테스트에서 갈아끼울 수 있게 분리한다. */
export interface StandingsCacheStore {
  read(league: string): Promise<{ rows: BasketballStandingRow[]; fetchedAt: Date } | null>;
  write(league: string, rows: BasketballStandingRow[]): Promise<void>;
}

const prismaStandingsCache: StandingsCacheStore = {
  async read(league) {
    const hit = await prisma.basketballStandingsCache.findUnique({ where: { league } });
    if (!hit) return null;
    const rows = hit.rows as unknown as BasketballStandingRow[];
    return Array.isArray(rows) && rows.length > 0 ? { rows, fetchedAt: hit.fetchedAt } : null;
  },
  async write(league, rows) {
    await prisma.basketballStandingsCache.upsert({
      where: { league },
      create: { league, rows: rows as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
      update: { rows: rows as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
    });
  },
};

/**
 * 외부 소스 → 캐시 폴백 결정 로직. I/O 를 전부 주입받아 순수하게 테스트 가능하다.
 * - 정상(팀 수 충족): 캐시에 저장하고 그대로 반환
 * - 실패 / 부분 응답(예: 29개 팀): 저장하지 않고 마지막 정상 캐시 반환(stale=true)
 * - 캐시도 없음: null → 호출부가 빈 200 대신 503 을 낸다
 */
export async function resolveStandingsWithCache(
  league: string,
  fetchRows: () => Promise<BasketballStandingRow[] | null>,
  cache: StandingsCacheStore = prismaStandingsCache,
): Promise<BasketballStandings | null> {
  let rows: BasketballStandingRow[] | null = null;
  try {
    rows = await fetchRows();
  } catch {
    rows = null;
  }

  if (rows && isCompleteStandings(league, rows)) {
    try {
      await cache.write(league, rows);
    } catch {
      // 캐시 저장 실패는 응답을 막지 않는다
    }
    return { rows, updatedAt: new Date(), stale: false };
  }

  try {
    const cached = await cache.read(league);
    if (cached) return { rows: cached.rows, updatedAt: cached.fetchedAt, stale: true };
  } catch {
    // 캐시 조회 실패 → 아래 null
  }
  return null;
}

async function fetchEspnNbaRows(): Promise<BasketballStandingRow[] | null> {
  const season = nbaSeasonYear();
  const response = await fetch(
    `https://site.api.espn.com/apis/v2/sports/basketball/nba/standings?season=${season}`,
    {
      headers: { accept: "application/json" },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) return null;
  return parseEspnNbaStandings(await response.json());
}

async function fetchNbaStandings(): Promise<BasketballStandings | null> {
  return resolveStandingsWithCache("NBA", fetchEspnNbaRows);
}

async function fetchWnbaStandings(): Promise<BasketballStandings | null> {
  const seasonStart = currentSeasonStart("WNBA") ?? new Date(Date.UTC(new Date().getUTCFullYear(), 2, 1));
  const matches = await prisma.match.findMany({
    where: {
      league: "WNBA",
      status: "FINISHED",
      startTime: { gte: seasonStart },
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      updatedAt: true,
    },
  });
  if (matches.length === 0) return null;

  const byTeam = new Map<number, Omit<BasketballStandingRow, "position" | "gamesBehind">>();
  const ensure = (teamId: number) => {
    let row = byTeam.get(teamId);
    if (!row) {
      row = { ourTeamId: teamId, played: 0, wins: 0, losses: 0, scored: 0, conceded: 0, difference: 0 };
      byTeam.set(teamId, row);
    }
    return row;
  };

  for (const match of matches) {
    if (match.homeScore == null || match.awayScore == null || match.homeScore === match.awayScore) continue;
    const home = ensure(match.homeTeamId);
    const away = ensure(match.awayTeamId);
    home.played += 1;
    away.played += 1;
    home.scored! += match.homeScore;
    home.conceded! += match.awayScore;
    away.scored! += match.awayScore;
    away.conceded! += match.homeScore;
    if (match.homeScore > match.awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }

  const sorted = [...byTeam.values()].map((row) => ({
    ...row,
    difference: (row.scored ?? 0) - (row.conceded ?? 0),
  })).sort((left, right) =>
    right.wins / Math.max(1, right.played) - left.wins / Math.max(1, left.played)
    || right.wins - left.wins
    || (right.difference ?? 0) - (left.difference ?? 0),
  );
  const leader = sorted[0];
  const rows = sorted.map((row, index) => ({
    ...row,
    position: index + 1,
    gamesBehind: gamesBehind(leader.wins, leader.losses, row.wins, row.losses),
  }));
  const updatedAt = matches.reduce(
    (latest, match) => match.updatedAt > latest ? match.updatedAt : latest,
    matches[0].updatedAt,
  );
  return { rows, updatedAt };
}

interface KblRow {
  rank?: number;
  tcode?: string;
  win?: number;
  loss?: number;
  winDiff?: number;
  tname?: string;
}

const KBL_HEADERS = {
  Channel: "WEB",
  TeamCode: "XX",
  "X-Requested-With": "XMLHttpRequest",
  lang: "ko",
  Origin: "https://kbl.or.kr",
  Referer: "https://kbl.or.kr/",
};

async function fetchKblJson(path: string): Promise<unknown> {
  const response = await fetch(`https://api.kbl.or.kr${path}`, {
    headers: KBL_HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchKblStandings(): Promise<BasketballStandings | null> {
  try {
    const payload = await fetchKblJson("/league/rank/team");
    if (Array.isArray(payload)) {
      const rows = (payload as KblRow[]).flatMap((row) => {
        const ourTeamId = row.tcode ? KBL_TEAM_IDS[row.tcode] : undefined;
        if (!ourTeamId || !Number.isFinite(row.rank) || !Number.isFinite(row.win) || !Number.isFinite(row.loss)) return [];
        const wins = Number(row.win);
        const losses = Number(row.loss);
        return [{
          position: Number(row.rank),
          ourTeamId,
          played: wins + losses,
          wins,
          losses,
          scored: null,
          conceded: null,
          difference: null,
          gamesBehind: Number(row.winDiff) > 0 ? Number(row.winDiff) : null,
          teamName: row.tname?.trim() || undefined,
        }];
      }).sort((left, right) => left.position - right.position);
      if (rows.length === 10) return { rows, updatedAt: new Date() };
    }
    // 오프시즌엔 현재 시즌 표가 빈 배열로 리셋된다(2026-08 실측) → 시즌 목록에서
    // 최근 시즌을 거슬러 최종 표를 찾는다 (glkey 예: S47G01 = 2025-2026 정규시즌).
    return await fetchKblPastSeason();
  } catch {
    return null;
  }
}

/** 시즌별 순위 응답 — /league/rank/{glkey} (현재 시즌 rank/team 과 필드명이 다르다) */
interface KblSeasonRow {
  rank?: number;
  teamCode?: string;
  teamName1?: string;
  TWin?: number;
  TLoss?: number;
  winDiff?: number;
}

async function fetchKblPastSeason(): Promise<BasketballStandings | null> {
  const seasons = await fetchKblJson("/season/list?seasonCategory=R&gameCode=01&seasonGrade=1");
  if (!Array.isArray(seasons)) return null;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
  for (const s of (seasons as Array<{ glkey?: string; seasonName?: string; gamedateEnd?: string }>).slice(0, 3)) {
    if (!s.glkey) continue;
    const payload = await fetchKblJson(`/league/rank/${s.glkey}`);
    if (!Array.isArray(payload)) continue;
    const rows = (payload as KblSeasonRow[]).flatMap((row) => {
      const ourTeamId = row.teamCode ? KBL_TEAM_IDS[row.teamCode] : undefined;
      if (!ourTeamId || !Number.isFinite(row.rank) || !Number.isFinite(row.TWin) || !Number.isFinite(row.TLoss)) return [];
      const wins = Number(row.TWin);
      const losses = Number(row.TLoss);
      return [{
        position: Number(row.rank),
        ourTeamId,
        played: wins + losses,
        wins,
        losses,
        scored: null,
        conceded: null,
        difference: null,
        gamesBehind: Number(row.winDiff) > 0 ? Number(row.winDiff) : null,
        teamName: row.teamName1?.trim() || undefined,
      }];
    }).sort((left, right) => left.position - right.position);
    if (rows.length === 10) {
      return {
        rows,
        updatedAt: new Date(),
        seasonLabel: s.seasonName,
        pastSeason: !!s.gamedateEnd && s.gamedateEnd < today,
      };
    }
  }
  return null;
}

function wkblSeasonCodes(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCMonth() >= 10 ? kst.getUTCFullYear() : kst.getUTCFullYear() - 1;
  const current = year - 1979;
  return [current, current - 1].map((value) => String(value).padStart(3, "0"));
}

function parseWkblRows(html: string): BasketballStandingRow[] {
  const $ = load(`<table><tbody>${html}</tbody></table>`);
  const rows: BasketballStandingRow[] = [];
  $("tr.team_rnak_table").each((_, element) => {
    const cells = $(element).find("td");
    const position = Number(cells.eq(0).text().trim());
    const teamName = cells.eq(1).text().replace(/\s+/g, " ").trim();
    const played = Number(cells.eq(2).text().trim());
    const record = cells.eq(3).text().match(/(\d+)승\s*(\d+)패/);
    const ourTeamId = WKBL_TEAM_IDS.find(([pattern]) => pattern.test(teamName))?.[1];
    if (!ourTeamId || !record || !Number.isFinite(position) || !Number.isFinite(played)) return;
    const wins = Number(record[1]);
    const losses = Number(record[2]);
    const gb = Number(cells.eq(5).text().trim());
    rows.push({
      position,
      ourTeamId,
      played,
      wins,
      losses,
      scored: null,
      conceded: null,
      difference: null,
      gamesBehind: gb > 0 ? gb : null,
      teamName,
    });
  });
  return rows.sort((left, right) => left.position - right.position);
}

async function fetchWkblStandings(): Promise<BasketballStandings | null> {
  for (const seasonCode of wkblSeasonCodes()) {
    try {
      const body = new URLSearchParams({ season_gu: seasonCode, gun: "1" });
      const response = await fetch("https://www.wkbl.or.kr/game/ajax/ajax_team_rank.asp", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) continue;
      const rows = parseWkblRows(await response.text());
      if (rows.length === 6 && rows.every((row) => row.played > 0)) {
        // 시즌코드 = 시작연도-1979. WKBL 시즌은 11월~3월이라 4~10월(KST)은 종료 시즌의 최종 표.
        const startYear = 1979 + Number(seasonCode);
        const kstMonth = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
        return {
          rows,
          updatedAt: new Date(),
          seasonLabel: `${startYear}-${startYear + 1}`,
          pastSeason: kstMonth >= 4 && kstMonth <= 10,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchBasketballStandings(league: string): Promise<BasketballStandings | null> {
  if (league === "NBA") return fetchNbaStandings();
  if (league === "WNBA") return fetchWnbaStandings();
  if (league === "KBL") return fetchKblStandings();
  if (league === "WKBL") return fetchWkblStandings();
  return null;
}
