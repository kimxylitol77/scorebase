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

/** NHL 용 라운드 라벨 (NBA 와 같은 round 키 재사용, 표시 명칭만 다름) */
export const NHL_ROUND_LABEL: Record<NbaRound, string> = {
  FIRST_ROUND: "1라운드",
  CONF_SEMIS: "컨퍼런스 세미파이널",
  CONF_FINALS: "컨퍼런스 파이널",
  FINALS: "스탠리컵 파이널",
};

export function getRoundLabel(league: "NBA" | "NHL"): Record<NbaRound, string> {
  return league === "NHL" ? NHL_ROUND_LABEL : ROUND_LABEL;
}

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
  // ESPN scoreboard 원시 JSON — 읽는 필드만 명시.
  interface EspnCompetitor { id?: string | number; wins?: number | string }
  interface EspnSeries {
    type?: string; competitors?: EspnCompetitor[]; completed?: boolean;
    totalCompetitions?: number | string; summary?: string;
  }
  interface EspnRaw {
    competitions?: Array<{ series?: EspnSeries; notes?: Array<{ headline?: string }> }>;
  }
  let raw: EspnRaw | null;
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
  // 결승 — NBA Finals / Stanley Cup Final
  if (/nba finals|stanley cup final/.test(h)) return "FINALS";
  // 컨퍼런스 파이널 — "East Conference Finals" / "Conference Finals"
  if (/conf(?:erence)?\s+finals/.test(h)) return "CONF_FINALS";
  // NHL 컨퍼런스 파이널 — "East Final" / "West Final" ("Conference" 없이 표기).
  // Stanley Cup Final(east/west 없음)은 위 FINALS 분기에서 이미 처리됨.
  if (/\b(?:east|west)\s+finals?\b/.test(h)) return "CONF_FINALS";
  // 컨퍼런스 세미 — NBA "Semifinals" / NHL "2nd Round"
  if (/semifinals/.test(h)) return "CONF_SEMIS";
  if (/2nd\s+round|second\s+round/.test(h)) return "CONF_SEMIS";
  // 1라운드 — NBA/NHL 둘 다 "1st Round"
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
    winsByEspnId: Map<string, number>;
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
    let acc = seriesMap.get(key);
    if (acc) {
      acc.games.push(game);
      // matches 는 startTime asc — 마지막 대입이 곧 최신 게임의 시리즈 정보.
      acc.info = info;
    } else {
      acc = {
        info,
        games: [game],
        teams: { id1: 0, id2: 0, t1ESPN: info.team1Id, t2ESPN: info.team2Id },
        winsByEspnId: new Map(),
      };
      seriesMap.set(key, acc);
    }
    // 승수는 raw 의 series.wins 를 믿지 않고 종료 게임을 직접 센다 — raw 는 경기 전
    // 수집 시점 값이라 시리즈 마지막 게임 결과가 빠질 수 있다 (2026 NHL 파이널 3-2 고착 실측).
    if (
      m.status === "FINISHED" &&
      m.homeScore != null &&
      m.awayScore != null &&
      m.homeScore !== m.awayScore
    ) {
      const winnerEspnId =
        m.homeScore > m.awayScore ? m.homeTeam.externalId : m.awayTeam.externalId;
      acc.winsByEspnId.set(winnerEspnId, (acc.winsByEspnId.get(winnerEspnId) ?? 0) + 1);
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
    // 직접 카운트 ∨ ESPN raw 승수 중 큰 값 — 카운트는 raw 에 series 정보가 없는 게임을
    // 놓치고, raw 승수는 마지막 게임 결과가 빠진다. 둘 다 실제보다 크게 잡히는 일은 없다.
    const t1Wins = Math.max(
      data.winsByEspnId.get(t1Team.externalId) ?? 0,
      data.info.team1Wins,
    );
    const t2Wins = Math.max(
      data.winsByEspnId.get(t2Team.externalId) ?? 0,
      data.info.team2Wins,
    );
    const winsNeeded = Math.ceil(data.info.totalGames / 2);
    const completed = t1Wins >= winsNeeded || t2Wins >= winsNeeded;
    const hi = Math.max(t1Wins, t2Wins);
    const lo = Math.min(t1Wins, t2Wins);
    const lead = t1Wins === t2Wins ? null : t1Wins > t2Wins ? t1Team : t2Team;
    const leadShort = lead?.shortName || lead?.name || "";
    const summary = completed
      ? `${leadShort} 시리즈 승리 ${hi}-${lo}`
      : lead
        ? `${leadShort} ${hi}-${lo} 리드`
        : t1Wins > 0
          ? `${t1Wins}-${t2Wins} 동률`
          : "";
    result.push({
      round: data.info.round,
      conference: data.info.conference,
      team1: {
        id: t1Team.id,
        name: t1Team.name,
        shortName: t1Team.shortName,
        logoUrl: t1Team.logoUrl,
        wins: t1Wins,
      },
      team2: {
        id: t2Team.id,
        name: t2Team.name,
        shortName: t2Team.shortName,
        logoUrl: t2Team.logoUrl,
        wins: t2Wins,
      },
      completed,
      totalGames: data.info.totalGames,
      summary,
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
