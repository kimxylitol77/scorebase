// NBA 플레이오프 브라켓 데이터 추출.
//
// 입력: DB Match[] (raw 에 ESPN scoreboard event JSON 포함)
// 출력: 라운드별 + 컨퍼런스별 시리즈 list
//
// ESPN raw 구조 (competitions[0]):
//   notes[0].headline: "West Semifinals - Game 5" / "East Conference Finals - Game 2" / "NBA Finals - Game 1"
//   series.type: "playoff"
//   series.summary: "SA leads series 3-2"
//   series.completed: boolean
//   series.totalCompetitions: 7 (BO7)
//   series.competitors[].wins: 각 팀 시즌 진행 현재 승수

import type { Match, Team } from "@prisma/client";

export type NbaRound =
  | "FIRST_ROUND"
  | "CONF_SEMIS"
  | "CONF_FINALS"
  | "FINALS";

export type NbaConference = "EAST" | "WEST" | null;

export const ROUND_ORDER: NbaRound[] = [
  "FIRST_ROUND",
  "CONF_SEMIS",
  "CONF_FINALS",
  "FINALS",
];

export const ROUND_LABEL: Record<NbaRound, string> = {
  FIRST_ROUND: "1라운드",
  CONF_SEMIS: "컨퍼런스 세미파이널",
  CONF_FINALS: "컨퍼런스 파이널",
  FINALS: "NBA 파이널",
};

export interface NbaSeriesGame {
  matchId: number;
  date: Date;
  gameNumber?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
}

export interface NbaPlayoffSeries {
  round: NbaRound;
  conference: NbaConference;
  team1: { id: number; name: string; shortName?: string | null; logoUrl: string | null; wins: number };
  team2: { id: number; name: string; shortName?: string | null; logoUrl: string | null; wins: number };
  completed: boolean;
  totalGames: number; // 보통 7 (BO7)
  summary: string; // ESPN summary (예: "SA leads series 3-2")
  games: NbaSeriesGame[];
}

type MatchWithTeams = Match & { homeTeam: Team; awayTeam: Team };

interface SeriesInfoFromRaw {
  round: NbaRound;
  conference: NbaConference;
  team1Id: number;
  team2Id: number;
  team1Wins: number;
  team2Wins: number;
  completed: boolean;
  totalGames: number;
  summary: string;
  gameNumber?: number;
}

function parseRawSeries(rawJson: string | null): SeriesInfoFromRaw | null {
  if (!rawJson) return null;
  let raw: any;
  try { raw = JSON.parse(rawJson); } catch { return null; }
  const comp = raw?.competitions?.[0];
  if (!comp) return null;
  const series = comp.series;
  if (!series || series.type !== "playoff") return null;
  const headline: string = comp.notes?.[0]?.headline ?? "";
  // round + conference 추출
  const round = parseRound(headline);
  if (!round) return null;
  const conference = parseConference(headline, round);

  const competitors = series.competitors ?? [];
  if (competitors.length < 2) return null;
  const t1 = Number(competitors[0].id);
  const t2 = Number(competitors[1].id);
  const t1Wins = Number(competitors[0].wins ?? 0);
  const t2Wins = Number(competitors[1].wins ?? 0);
  const gameMatch = headline.match(/Game\s+(\d+)/i);
  return {
    round,
    conference,
    team1Id: t1,
    team2Id: t2,
    team1Wins: t1Wins,
    team2Wins: t2Wins,
    completed: Boolean(series.completed),
    totalGames: Number(series.totalCompetitions ?? 7),
    summary: String(series.summary ?? ""),
    gameNumber: gameMatch ? Number(gameMatch[1]) : undefined,
  };
}

function parseRound(headline: string): NbaRound | null {
  const h = headline.toLowerCase();
  if (/nba finals/.test(h)) return "FINALS";
  // ESPN 패턴: "East Conference Finals" / "Conference Finals"
  if (/conf(?:erence)?\s+finals/.test(h)) return "CONF_FINALS";
  // "East Semifinals" / "West Semifinals" (현재 ESPN 의 NBA semis 표기)
  if (/semifinals/.test(h)) return "CONF_SEMIS";
  // ESPN 은 "1st Round" (숫자 + ordinal) 사용 — "first round" 영문 X
  if (/1st\s+round|first\s+round/.test(h)) return "FIRST_ROUND";
  return null;
}

function parseConference(headline: string, round: NbaRound): NbaConference {
  if (round === "FINALS") return null;
  const h = headline.toLowerCase();
  if (/\beast\b/.test(h)) return "EAST";
  if (/\bwest\b/.test(h)) return "WEST";
  return null;
}

/** ESPN externalId(string) → 우리 Team.id 매핑용 — 매치의 homeTeam/awayTeam 참조 */
export function getNbaPlayoffBracket(
  matches: MatchWithTeams[],
): NbaPlayoffSeries[] {
  // 1) 각 매치 → series info 추출 + 시리즈 키로 그룹화
  const seriesMap = new Map<string, {
    info: SeriesInfoFromRaw;
    games: NbaSeriesGame[];
    teams: { id1: number; id2: number; t1ESPN: number; t2ESPN: number };
  }>();
  // ESPN externalId 와 우리 Team.id 매핑 캐시
  const espnToOurTeam = new Map<string, Team>();
  for (const m of matches) {
    espnToOurTeam.set(m.homeTeam.externalId, m.homeTeam);
    espnToOurTeam.set(m.awayTeam.externalId, m.awayTeam);
  }
  for (const m of matches) {
    const info = parseRawSeries(m.raw);
    if (!info) continue;
    // 시리즈 키 — 두 팀 ESPN id 정렬
    const key = `${info.round}:${[info.team1Id, info.team2Id].sort().join("-")}`;
    const existing = seriesMap.get(key);
    const game: NbaSeriesGame = {
      matchId: m.id,
      date: m.startTime,
      gameNumber: info.gameNumber,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
    };
    if (existing) {
      existing.games.push(game);
      // 가장 최신 게임의 시리즈 정보로 갱신 (wins/summary/completed 업데이트)
      if (m.startTime.getTime() > existing.info.gameNumber!) {
        existing.info = info;
      }
    } else {
      seriesMap.set(key, {
        info,
        games: [game],
        teams: { id1: 0, id2: 0, t1ESPN: info.team1Id, t2ESPN: info.team2Id },
      });
    }
  }

  // 2) 각 시리즈 — ESPN id 로 우리 Team 찾기
  const result: NbaPlayoffSeries[] = [];
  for (const [, data] of seriesMap) {
    const t1Team = espnToOurTeam.get(String(data.info.team1Id));
    const t2Team = espnToOurTeam.get(String(data.info.team2Id));
    if (!t1Team || !t2Team) continue;
    // game 시간순 정렬
    data.games.sort((a, b) => a.date.getTime() - b.date.getTime());
    result.push({
      round: data.info.round,
      conference: data.info.conference,
      team1: {
        id: t1Team.id,
        name: t1Team.name,
        shortName: t1Team.shortName,
        logoUrl: t1Team.logoUrl,
        wins: data.info.team1Wins,
      },
      team2: {
        id: t2Team.id,
        name: t2Team.name,
        shortName: t2Team.shortName,
        logoUrl: t2Team.logoUrl,
        wins: data.info.team2Wins,
      },
      completed: data.info.completed,
      totalGames: data.info.totalGames,
      summary: data.info.summary,
      games: data.games,
    });
  }

  // 3) 정렬 — round 순서 + 컨퍼런스 (East 먼저)
  const roundIdx: Record<NbaRound, number> = {
    FIRST_ROUND: 0,
    CONF_SEMIS: 1,
    CONF_FINALS: 2,
    FINALS: 3,
  };
  result.sort((a, b) => {
    const r = roundIdx[a.round] - roundIdx[b.round];
    if (r !== 0) return r;
    const conf = (a.conference === "EAST" ? 0 : a.conference === "WEST" ? 1 : 2) -
      (b.conference === "EAST" ? 0 : b.conference === "WEST" ? 1 : 2);
    return conf;
  });
  return result;
}

/** 라운드별 그룹화 */
export function groupByRound(
  series: NbaPlayoffSeries[],
): Record<NbaRound, NbaPlayoffSeries[]> {
  const out: Record<NbaRound, NbaPlayoffSeries[]> = {
    FIRST_ROUND: [],
    CONF_SEMIS: [],
    CONF_FINALS: [],
    FINALS: [],
  };
  for (const s of series) out[s.round].push(s);
  return out;
}
