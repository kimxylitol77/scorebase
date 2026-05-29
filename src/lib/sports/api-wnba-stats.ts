// API-Sports Basketball v1 — WNBA 매치 stats helper.
// game.id 로 팀 stats (FG%/리바/어시 등) + 선수 boxscore 추출.
// route.ts WNBA 분기에서 호출 → SportLiveDetail summary 로 전달.
//
// endpoint:
//   /games/statistics/teams?id={game_id}   — 팀별 박스스코어 (2 rows)
//   /games/statistics/players?id={game_id} — 선수별 boxscore (10~12 per team)

import axios from "axios";
import { toKoreanPlayerName } from "@/lib/player-names";
import type { BasketballPlayerBox } from "@/lib/sports/live-scores";

const BASE = "https://v1.basketball.api-sports.io";

interface TeamStat {
  game: { id: number };
  team: { id: number };
  field_goals: { total: number; attempts: number; percentage: number | null };
  threepoint_goals: { total: number; attempts: number; percentage: number | null };
  freethrows_goals: { total: number; attempts: number; percentage: number | null };
  rebounds: { total: number; offence: number; defense: number };
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  personal_fouls: number;
}

interface PlayerStat {
  game: { id: number };
  team: { id: number };
  player: { id: number; name: string };
  type: "starters" | "bench";
  minutes: string;
  field_goals: { total: number; attempts: number; percentage: number | null };
  threepoint_goals: { total: number; attempts: number; percentage: number | null };
  freethrows_goals: { total: number; attempts: number; percentage: number | null };
  rebounds: { total: number };
  assists: number;
  points: number;
}

export interface BasketballTeamStat {
  label: string;
  value: string;
  raw: number;
}

export interface BasketballLeader {
  category: string;
  playerName: string;
  displayValue: string;
}

export interface WnbaGameStatsResult {
  homeTeamId: number;
  awayTeamId: number;
  homeStats: BasketballTeamStat[];
  awayStats: BasketballTeamStat[];
  homeLeaders: BasketballLeader[];
  awayLeaders: BasketballLeader[];
  homePlayers: BasketballPlayerBox[];
  awayPlayers: BasketballPlayerBox[];
}

/** PlayerStat → 공통 박스스코어 행. v1 엔 steals/blocks/oreb 미제공 → null. 득점순 정렬용 반환. */
function toPlayerBox(p: PlayerStat): BasketballPlayerBox {
  return {
    name: toKoreanPlayerName(p.player.name),
    starter: p.type === "starters",
    min: p.minutes ?? "",
    points: p.points ?? 0,
    reb: p.rebounds?.total ?? 0,
    oreb: null,
    assists: p.assists ?? 0,
    steals: null,
    blocks: null,
    fgm: p.field_goals?.total ?? 0,
    fga: p.field_goals?.attempts ?? 0,
    tpm: p.threepoint_goals?.total ?? 0,
    tpa: p.threepoint_goals?.attempts ?? 0,
    ftm: p.freethrows_goals?.total ?? 0,
    fta: p.freethrows_goals?.attempts ?? 0,
  };
}

/** 선발 먼저, 그다음 득점 내림차순 */
function sortPlayers(players: PlayerStat[]): BasketballPlayerBox[] {
  return players
    .map(toPlayerBox)
    .sort((a, b) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1;
      return b.points - a.points;
    });
}

/** TeamStat → UI 표시 row 변환 */
function teamStatsToRows(s: TeamStat): BasketballTeamStat[] {
  return [
    { label: "FG%", value: s.field_goals.percentage != null ? `${s.field_goals.percentage}%` : "-", raw: s.field_goals.percentage ?? 0 },
    { label: "3P%", value: s.threepoint_goals.percentage != null ? `${s.threepoint_goals.percentage}%` : "-", raw: s.threepoint_goals.percentage ?? 0 },
    { label: "FT%", value: s.freethrows_goals.percentage != null ? `${s.freethrows_goals.percentage}%` : "-", raw: s.freethrows_goals.percentage ?? 0 },
    { label: "리바", value: String(s.rebounds.total), raw: s.rebounds.total },
    { label: "어시", value: String(s.assists), raw: s.assists },
    { label: "스틸", value: String(s.steals), raw: s.steals },
    { label: "블록", value: String(s.blocks), raw: s.blocks },
    { label: "턴오버", value: String(s.turnovers), raw: s.turnovers },
    { label: "파울", value: String(s.personal_fouls), raw: s.personal_fouls },
  ];
}

/** 팀 내 카테고리별 리더 추출 (득점/리바/어시) */
function teamLeaders(players: PlayerStat[]): BasketballLeader[] {
  if (players.length === 0) return [];
  const max = (key: (p: PlayerStat) => number) =>
    players.reduce<PlayerStat | null>((acc, p) => (acc == null || key(p) > key(acc) ? p : acc), null);

  const topPts = max((p) => p.points);
  const topReb = max((p) => p.rebounds.total);
  const topAst = max((p) => p.assists);

  const out: BasketballLeader[] = [];
  if (topPts && topPts.points > 0) {
    out.push({ category: "득점", playerName: toKoreanPlayerName(topPts.player.name), displayValue: `${topPts.points}점` });
  }
  if (topReb && topReb.rebounds.total > 0) {
    out.push({ category: "리바", playerName: toKoreanPlayerName(topReb.player.name), displayValue: `${topReb.rebounds.total}리바` });
  }
  if (topAst && topAst.assists > 0) {
    out.push({ category: "어시", playerName: toKoreanPlayerName(topAst.player.name), displayValue: `${topAst.assists}어시` });
  }
  return out;
}

/**
 * WNBA 매치의 팀 stats + 선수 리더 추출.
 * gameId = api-sports basketball v1 game.id (= 우리 Match.externalId for WNBA).
 * homeTeamApiId / awayTeamApiId = api-sports team id (Match collector 가 Team.externalId 로 저장).
 *
 * stats 없으면 빈 결과 반환 (LIVE 시작 직후 or 미시작 매치).
 */
export async function fetchWnbaGameStats(
  gameId: string,
  homeTeamApiId: string,
  awayTeamApiId: string,
): Promise<WnbaGameStatsResult | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  try {
    const [teamRes, playerRes] = await Promise.all([
      axios.get<{ response: TeamStat[] }>(`${BASE}/games/statistics/teams`, {
        params: { id: gameId },
        headers: { "x-apisports-key": key },
        timeout: 15_000,
      }),
      axios.get<{ response: PlayerStat[] }>(`${BASE}/games/statistics/players`, {
        params: { id: gameId },
        headers: { "x-apisports-key": key },
        timeout: 15_000,
      }),
    ]);

    const teams = teamRes.data?.response ?? [];
    const players = playerRes.data?.response ?? [];

    if (teams.length === 0) return null;

    const homeApiId = Number(homeTeamApiId);
    const awayApiId = Number(awayTeamApiId);

    const homeTeam = teams.find((t) => t.team.id === homeApiId);
    const awayTeam = teams.find((t) => t.team.id === awayApiId);

    const homePlayers = players.filter((p) => p.team.id === homeApiId);
    const awayPlayers = players.filter((p) => p.team.id === awayApiId);

    return {
      homeTeamId: homeApiId,
      awayTeamId: awayApiId,
      homeStats: homeTeam ? teamStatsToRows(homeTeam) : [],
      awayStats: awayTeam ? teamStatsToRows(awayTeam) : [],
      homeLeaders: teamLeaders(homePlayers),
      awayLeaders: teamLeaders(awayPlayers),
      homePlayers: sortPlayers(homePlayers),
      awayPlayers: sortPlayers(awayPlayers),
    };
  } catch (e) {
    console.warn("[wnba-stats] fetch failed:", (e as Error).message);
    return null;
  }
}
