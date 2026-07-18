import { load } from "cheerio";
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
}

export interface BasketballStandings {
  rows: BasketballStandingRow[];
  updatedAt: Date;
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

async function fetchKblStandings(): Promise<BasketballStandings | null> {
  try {
    const response = await fetch("https://api.kbl.or.kr/league/rank/team", {
      headers: {
        Channel: "WEB",
        TeamCode: "XX",
        "X-Requested-With": "XMLHttpRequest",
        lang: "ko",
        Origin: "https://kbl.or.kr",
        Referer: "https://kbl.or.kr/",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) return null;
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
    return rows.length === 10 ? { rows, updatedAt: new Date() } : null;
  } catch {
    return null;
  }
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
        return { rows, updatedAt: new Date() };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchBasketballStandings(league: string): Promise<BasketballStandings | null> {
  if (league === "WNBA") return fetchWnbaStandings();
  if (league === "KBL") return fetchKblStandings();
  if (league === "WKBL") return fetchWkblStandings();
  return null;
}
