// 한 매치에 대한 PreviewContext / RecapContext 를 한 번에 빌드.

import type { PredictMatch } from "./types";
import { toKoreanPlayerName } from "@/lib/player-names";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { calcEloTable, getElo } from "./elo";
import { buildScoreDistribution } from "./score-distribution";

const SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
]);
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { calcForm } from "./form";
import { calcH2H } from "./h2h";
import { calcStandings } from "./standings";
import { calcHomeAway } from "./home-away";
import { calcStreaks } from "./streak";
import { calcRecentTrend } from "./recent-trend";
import { calcWinProbability } from "./win-probability";
import type { PreviewContext } from "@/prompts/match-preview";
import {
  fetchSeasonInjuries,
  fetchSeasonTopScorers,
  getApiFootballSeason,
  getTeamInjuries,
  getTeamKeyPlayers,
  API_FOOTBALL_LEAGUE_ID,
  findFixtureByDateAndTeams,
  fetchFixtureLineups,
  fetchFixtureEvents,
} from "@/lib/sports/api-football-pro";
import type { RecapContext } from "@/prompts/match-recap";

export function buildMatchContext(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  referenceTime: Date,
): PreviewContext {
  const before = matches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );
  const elo = calcEloTable(before);
  const homeElo = getElo(elo, homeTeamId);
  const awayElo = getElo(elo, awayTeamId);

  const wp = calcWinProbability(homeElo, awayElo, league);

  const standings = calcStandings(matches, referenceTime);
  const homeRow = standings.byTeam.get(homeTeamId);
  const awayRow = standings.byTeam.get(awayTeamId);

  const homeHA = calcHomeAway(matches, homeTeamId, referenceTime);
  const awayHA = calcHomeAway(matches, awayTeamId, referenceTime);

  const homeStreak = calcStreaks(matches, homeTeamId, referenceTime);
  const awayStreak = calcStreaks(matches, awayTeamId, referenceTime);

  const homeForm = calcForm(matches, homeTeamId, referenceTime, 5);
  const awayForm = calcForm(matches, awayTeamId, referenceTime, 5);

  const homeTrend = calcRecentTrend(matches, homeTeamId, referenceTime, 5);
  const awayTrend = calcRecentTrend(matches, awayTeamId, referenceTime, 5);

  const h2h = calcH2H(matches, homeTeamId, awayTeamId, referenceTime, 5);

  return {
    elo: { home: homeElo, away: awayElo },
    winProb: { home: wp.home, draw: wp.draw, away: wp.away },
    position: homeRow && awayRow
      ? {
          home: homeRow.position,
          away: awayRow.position,
          total: standings.rows.length,
        }
      : undefined,
    points:
      homeRow && awayRow
        ? { home: homeRow.points, away: awayRow.points }
        : undefined,
    attackDefense: {
      home: {
        attack: standings.attackRank.get(homeTeamId),
        defense: standings.defenseRank.get(homeTeamId),
      },
      away: {
        attack: standings.attackRank.get(awayTeamId),
        defense: standings.defenseRank.get(awayTeamId),
      },
    },
    homeAway: {
      home: {
        wins: homeHA.home.wins,
        draws: homeHA.home.draws,
        losses: homeHA.home.losses,
        ppg: homeHA.home.ppg,
      },
      away: {
        wins: awayHA.away.wins,
        draws: awayHA.away.draws,
        losses: awayHA.away.losses,
        ppg: awayHA.away.ppg,
      },
    },
    recentForm: {
      home: homeForm.results,
      away: awayForm.results,
    },
    streak: {
      home: {
        unbeaten: homeStreak.unbeatenRun,
        winning: homeStreak.winningRun,
        losing: homeStreak.losingRun,
      },
      away: {
        unbeaten: awayStreak.unbeatenRun,
        winning: awayStreak.winningRun,
        losing: awayStreak.losingRun,
      },
    },
    trend: {
      home: {
        gf: homeTrend.avgGoalsFor,
        ga: homeTrend.avgGoalsAgainst,
        ppg: homeTrend.ppg,
      },
      away: {
        gf: awayTrend.avgGoalsFor,
        ga: awayTrend.avgGoalsAgainst,
        ppg: awayTrend.ppg,
      },
    },
    h2h: {
      homeWins: h2h.homeTeamWins,
      draws: h2h.draws,
      awayWins: h2h.awayTeamWins,
      total: h2h.total,
    },
    topScores: SOCCER_LEAGUES.has(league)
      ? buildScoreDistribution(
          { home: wp.home, draw: wp.draw, away: wp.away },
          league,
        ).topScores
      : undefined,
    // 야구(KBO/NPB/MLB) — 시즌 평균 득실점. Poisson 모델 input 으로 사용.
    baseballStats:
      BASEBALL_LEAGUES.has(league) &&
      homeRow &&
      awayRow &&
      homeRow.played > 0 &&
      awayRow.played > 0
        ? {
            home: {
              rpg: homeRow.goalsFor / homeRow.played,
              rapg: homeRow.goalsAgainst / homeRow.played,
              played: homeRow.played,
            },
            away: {
              rpg: awayRow.goalsFor / awayRow.played,
              rapg: awayRow.goalsAgainst / awayRow.played,
              played: awayRow.played,
            },
          }
        : undefined,
  };
}

/**
 * api-football Pro 데이터(부상자, 핵심 선수)로 PreviewContext 보강.
 * 축구 리그(EPL/LALIGA/...)에만 동작. 키 없으면 그대로 반환.
 */
export async function enrichContextWithApiFootball(
  context: PreviewContext,
  league: string,
  homeTeamName: string,
  awayTeamName: string,
  referenceTime: Date,
): Promise<PreviewContext> {
  if (!process.env.API_FOOTBALL_KEY) return context;
  if (!API_FOOTBALL_LEAGUE_ID[league]) return context;

  const season = getApiFootballSeason(referenceTime, league);

  try {
    const [allInjuries, allScorers] = await Promise.all([
      fetchSeasonInjuries(league, season),
      fetchSeasonTopScorers(league, season),
    ]);

    const beforeIso = referenceTime.toISOString();
    const homeInj = getTeamInjuries(allInjuries, homeTeamName, beforeIso, 6);
    const awayInj = getTeamInjuries(allInjuries, awayTeamName, beforeIso, 6);
    const homeKey = getTeamKeyPlayers(allScorers, homeTeamName, 3);
    const awayKey = getTeamKeyPlayers(allScorers, awayTeamName, 3);

    // Supabase + 코드 fallback 한 번에 batch 조회 (id 있는 모든 선수)
    const resolved = await resolvePlayerNames(
      [
        ...homeInj.map((i) => ({ apiFootballId: i.playerId, nameEn: i.playerName })),
        ...awayInj.map((i) => ({ apiFootballId: i.playerId, nameEn: i.playerName })),
        ...homeKey.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
        ...awayKey.map((p) => ({ apiFootballId: p.playerId, nameEn: p.playerName })),
      ],
      "soccer",
      league,
    );
    const ko = (id: number, en: string) =>
      resolved.get(id)?.ko ?? toKoreanPlayerName(en);

    return {
      ...context,
      injuries: {
        home: homeInj.map((i) => ({
          name: ko(i.playerId, i.playerName),
          reason: i.reason,
        })),
        away: awayInj.map((i) => ({
          name: ko(i.playerId, i.playerName),
          reason: i.reason,
        })),
      },
      keyPlayers: {
        home: homeKey.map((p) => ({
          name: ko(p.playerId, p.playerName),
          goals: p.goals,
          assists: p.assists,
        })),
        away: awayKey.map((p) => ({
          name: ko(p.playerId, p.playerName),
          goals: p.goals,
          assists: p.assists,
        })),
      },
    };
  } catch {
    return context;
  }
}

/**
 * RECAP 전용 추가 데이터 — 실제 라인업, 골 시간, 카드 등.
 * api-football fixture ID 를 자체 매칭으로 찾아 호출.
 */
export async function enrichRecapWithApiFootball(
  context: RecapContext,
  league: string,
  homeTeamId: number,
  homeTeamName: string,
  awayTeamName: string,
  matchStartTime: Date,
): Promise<RecapContext> {
  if (!process.env.API_FOOTBALL_KEY) return context;
  if (!API_FOOTBALL_LEAGUE_ID[league]) return context;

  try {
    const fixtureId = await findFixtureByDateAndTeams(
      league,
      matchStartTime,
      homeTeamName,
      awayTeamName,
    );
    if (!fixtureId) return context;

    const [lineups, events] = await Promise.all([
      fetchFixtureLineups(fixtureId),
      fetchFixtureEvents(fixtureId),
    ]);

    const homeLine = lineups.find(
      (l) =>
        l.teamName.toLowerCase().includes(homeTeamName.toLowerCase()) ||
        homeTeamName.toLowerCase().includes(l.teamName.toLowerCase()),
    );
    const awayLine = lineups.find(
      (l) =>
        l.teamName.toLowerCase().includes(awayTeamName.toLowerCase()) ||
        awayTeamName.toLowerCase().includes(l.teamName.toLowerCase()),
    );

    return {
      ...context,
      lineups: {
        home: {
          formation: homeLine?.formation,
          startXI: (homeLine?.startXI ?? []).map(toKoreanPlayerName),
          coach: homeLine?.coach,
        },
        away: {
          formation: awayLine?.formation,
          startXI: (awayLine?.startXI ?? []).map(toKoreanPlayerName),
          coach: awayLine?.coach,
        },
      },
      events: events.map((e) => ({
        minute: e.minute,
        type: e.type,
        detail: e.detail,
        team:
          e.teamId === homeTeamId
            ? "home"
            : ((e.teamName.toLowerCase().includes(homeTeamName.toLowerCase()) ||
                homeTeamName.toLowerCase().includes(e.teamName.toLowerCase()))
                ? "home"
                : "away"),
        player: toKoreanPlayerName(e.playerName),
        assist: e.assistName ? toKoreanPlayerName(e.assistName) : e.assistName,
      })),
    };
  } catch {
    return context;
  }
}
