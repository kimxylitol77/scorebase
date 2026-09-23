// LoL 스탯 표 로더 — 경기 기록(lolGames) 세트 집계(lol-player-stats) + 팀명 + 선수 사전 사진·포지션. 1시간 캐시.
import { unstable_cache } from "next/cache";
import { aggregateLolPlayers, aggregateLolTeams } from "@/lib/sports/lol-player-stats";
import rawPlayers from "../../../../data/lol-players.json";
import type { LolSeasonRow } from "./stats-table";

const PLAYERS = (rawPlayers as { players?: Record<string, { name?: string; photo?: string; position?: number; teamId?: string }> }).players ?? {};
const POS: Record<number, string> = { 1: "TOP", 2: "MID", 3: "JGL", 4: "ADC", 5: "SUP" };
/** 세트 기록(lolGames)이 쌓이는 리그만 — LPL 은 일정만 있어 제외(2026 실측 LOL 182·LEC 106·LCS 60경기) */
export const LOL_STATS_LEAGUES = ["LOL", "LEC", "LCS"] as const;
export const LOL_LEAGUE_KO: Record<string, string> = { LOL: "LCK", LPL: "LPL", LEC: "LEC", LCS: "LCS" };

/** 시즌 시작(1/1) 이후 경기만 — LoL 은 달력 연도 시즌 */
function seasonStart(now = new Date()): Date { return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)); }

export const getLolStatsData = unstable_cache(
  async (league: string): Promise<{ season: string; rows: LolSeasonRow[]; photoOf: Record<string, string> }> => {
    const [players, teams] = await Promise.all([aggregateLolPlayers(league, seasonStart()), aggregateLolTeams(league)]);
    const teamName = new Map(teams.map((t) => [t.teamId, t.short || t.name]));
    const photoOf: Record<string, string> = {};
    const rows: LolSeasonRow[] = players.map((p) => {
      const d = PLAYERS[p.playerId];
      if (d?.photo) photoOf[p.playerId] = d.photo;
      return { playerId: p.playerId, name: p.name, team: teamName.get(p.teamId) ?? "", pos: d?.position ? POS[d.position] ?? null : null, games: p.games, kills: p.kills, deaths: p.deaths, assists: p.assists, kda: p.kda, csPerGame: p.csPerGame, csPerMin: p.csPerMin, wins: p.wins, winRate: p.winRate };
    });
    return { season: String(new Date().getUTCFullYear()), rows, photoOf };
  },
  ["lol-stats-data"],
  { revalidate: 3600 },
);
