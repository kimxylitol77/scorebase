// 한 매치에 대한 PreviewContext / RecapContext 를 한 번에 빌드.

import type { PredictMatch } from "./types";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { toKoreanPlayerName } from "@/lib/player-names";
import { resolvePlayerNames } from "@/lib/players/resolvePlayerName";
import { calcEloTable, getElo, eloSpread, type EloTable } from "./elo";
import {
  calcLeagueBaseRate,
  blendLeaguePrior,
  priorWeight,
} from "./league-prior";
import { getWorldCupSeedElo } from "./world-cup-elos";
import { getFifaRank } from "@/lib/sports/fifa-rankings";
import { buildScoreDistribution } from "./score-distribution";

const SOCCER_LEAGUES = new Set([
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "UEL",
  "UECL",
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
import {
  predictTotalMarket,
  predictHandicapMarket,
  getSportProfile,
  bestDoubleChance,
  predictBttsMarket,
  SOCCER_LEAGUES_FOR_MARKETS,
} from "./markets";
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

/** 예측 신뢰도/데이터부족 기준 — 양 팀 직전 경기 표본 최소치. evaluate MIN_PRIOR 와 동일. */
export const MIN_PRIOR_MATCHES = 5;

/** 선발 JSON(Match.homeStarter) 에서 ERA 만 안전 추출 — predictTotalMarket 야구 OU(baseball-poisson) 보강용. */
export function starterEraFromJson(s: string | null | undefined): number | undefined {
  if (!s) return undefined;
  try {
    const era = (JSON.parse(s) as { era?: number }).era;
    return typeof era === "number" ? era : undefined;
  } catch {
    return undefined;
  }
}

// 국가대표 Elo (친선·월드컵 winProb 용) — world-cup-elos(본선국 실제 Elo) 우선, 없으면 FIFA랭킹 환산.
// 친선은 클럽 Elo(calcEloTable)가 주전 결장·결과 변동으로 평준화돼 부정확하므로 별도 소스 사용.
// export — MatchInsight 위젯도 국가대항 매치 Elo 표시·fallback 계산에 동일 소스 사용.
export function nationalElo(name: string): number {
  const seed = getWorldCupSeedElo(name);
  if (seed != null) return seed;
  const rank = getFifaRank(name);
  if (rank != null) return Math.max(1300, 2050 - 250 * Math.log10(rank));
  return 1500;
}

/** winProb 최고 확률 → 신뢰도 등급 (코드 단일 소스 — 본문·위젯 동일값).
 *  "high" 컷은 Strong Pick 리그별 임계와 동일 — 배지와 신뢰도 라벨이 어긋나지 않게. */
export function computeConfidence(
  wp: {
    home: number;
    draw: number;
    away: number;
  },
  league?: string,
): { pick: "HOME" | "DRAW" | "AWAY"; prob: number; level: "high" | "medium" | "low" } {
  const entries: Array<["HOME" | "DRAW" | "AWAY", number]> = [
    ["HOME", wp.home],
    ["DRAW", wp.draw],
    ["AWAY", wp.away],
  ];
  const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
  const prob = top[1];
  const level = prob >= strongPickThreshold(league) ? "high" : prob >= 0.5 ? "medium" : "low";
  return { pick: top[0], prob, level };
}

/** 한 팀의 referenceTime 이전 FINISHED 경기 수. */
function countPlayedBefore(
  matches: PredictMatch[],
  teamId: number,
  refTime: number,
): number {
  let n = 0;
  for (const m of matches) {
    if (
      m.status === "FINISHED" &&
      m.startTime.getTime() < refTime &&
      (m.homeTeamId === teamId || m.awayTeamId === teamId)
    )
      n++;
  }
  return n;
}

/** 직전 경기로부터 휴식일. 직전 경기 없으면 null. */
export function computeRestDays(
  matches: PredictMatch[],
  teamId: number,
  refTime: Date,
): number | null {
  let prev: number | null = null;
  for (const m of matches) {
    const t = m.startTime.getTime();
    if (
      m.status === "FINISHED" &&
      t < refTime.getTime() &&
      (m.homeTeamId === teamId || m.awayTeamId === teamId)
    ) {
      if (prev == null || t > prev) prev = t;
    }
  }
  if (prev == null) return null;
  return Math.round((refTime.getTime() - prev) / 86_400_000);
}

export function buildMatchContext(
  matches: PredictMatch[],
  league: string,
  homeTeamId: number,
  awayTeamId: number,
  referenceTime: Date,
  homeName?: string,
  awayName?: string,
  baseballStarter?: { homeEra?: number; awayEra?: number },
): PreviewContext {
  const before = matches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );
  // 국가대항(친선·월드컵 본선)은 클럽 Elo 부정확 → 국가대표 Elo(world-cup-elos + FIFA랭킹) 사용.
  // WORLD_CUP: 본선 매치 히스토리가 적어 calcEloTable 이 전원 1500 — 글이 "동점 Elo" 오판.
  // predictionEngine 의 NATIONAL_TEAM_LEAGUES 처리와 동일하게 시드 Elo (글-위젯 정합, 2026-06-11).
  let homeElo: number, awayElo: number;
  let eloTable: EloTable | null = null;
  if ((league === "INTL_FRIENDLY" || league === "WORLD_CUP") && homeName && awayName) {
    homeElo = nationalElo(homeName);
    awayElo = nationalElo(awayName);
  } else {
    eloTable = calcEloTable(before);
    homeElo = getElo(eloTable, homeTeamId);
    awayElo = getElo(eloTable, awayTeamId);
  }

  let wp = calcWinProbability(homeElo, awayElo, league, { homeTeamName: homeName });
  // 베이스레이트 prior — Elo 분산이 작은(수집 이력 부족·시장 odds 미커버) 리그는
  // 리그 실측 1X2 분포로 후퇴 (league-prior.ts). 정상 리그(stddev 70+)는 가중 0 — 불변.
  // 친선은 국대 Elo 소스라 클럽 풀 분포와 무관 → skip.
  if (eloTable) {
    wp = blendLeaguePrior(
      wp,
      calcLeagueBaseRate(before, referenceTime),
      priorWeight(eloSpread(eloTable)),
    );
  }

  // OVER/UNDER + 핸디캡 — 위젯(MatchInsight)과 동일한 결정적 계산(referenceTime=startTime,
  // 시장 blend 없음 → 시점 무관)을 글 생성 시점 context 에 담는다. 본문 표가 LLM 추측
  // 대신 이 확정값을 쓰게 해 위젯과 single source(핸디캡 방향 반대 표시 근절).
  const sportProfile = getSportProfile(league);
  const ouMarket = sportProfile
    ? predictTotalMarket(matches, league, homeTeamId, awayTeamId, referenceTime, {
        homeStarterEra: baseballStarter?.homeEra,
        awayStarterEra: baseballStarter?.awayEra,
        homeTeamName: homeName,
      })
    : null;
  const hcMarket = sportProfile
    ? predictHandicapMarket(matches, league, homeTeamId, awayTeamId, referenceTime)
    : null;
  // 더블찬스(1X2 파생)·BTTS — 축구 시장만(위젯 MatchInsight 257·259 와 동일 기준).
  // DC 는 wp(=글 생성 시점 저장되는 predHome, 위젯이 override 로 쓰는 값) 파생이라 일치 유지.
  const isSoccerMarket = SOCCER_LEAGUES_FOR_MARKETS.has(league);
  const dcMarket = isSoccerMarket ? bestDoubleChance(wp) : null;
  const bttsMarket = isSoccerMarket
    ? predictBttsMarket(matches, league, homeTeamId, awayTeamId, referenceTime)
    : null;

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

  // ── 예측 신뢰도 / 데이터부족 / 휴식일 / 핵심 이유 (코드 산출 — LLM 추측 X) ──
  const confidence = computeConfidence(wp, league);
  const homePlayed = countPlayedBefore(matches, homeTeamId, referenceTime.getTime());
  const awayPlayed = countPlayedBefore(matches, awayTeamId, referenceTime.getTime());
  const dataSparse = {
    sparse: Math.min(homePlayed, awayPlayed) < MIN_PRIOR_MATCHES,
    homePlayed,
    awayPlayed,
    minRequired: MIN_PRIOR_MATCHES,
  };
  const restDays = {
    home: computeRestDays(matches, homeTeamId, referenceTime),
    away: computeRestDays(matches, awayTeamId, referenceTime),
  };

  // 핵심 이유 TOP 3 — 신호 크기순. text 는 {home}/{away} placeholder (소비처에서 팀명 치환).
  const signals: Array<{ score: number; text: string }> = [];
  const eloDiff = homeElo - awayElo;
  if (Math.abs(eloDiff) >= 25) {
    const fav = eloDiff > 0 ? "{home}" : "{away}";
    signals.push({
      score: Math.abs(eloDiff) / 8,
      text: `${fav} Elo 우위 (${Math.round(homeElo)} vs ${Math.round(awayElo)})`,
    });
  }
  const formDiff = homeTrend.ppg - awayTrend.ppg;
  if (homeTrend.matches >= 3 && awayTrend.matches >= 3 && Math.abs(formDiff) >= 0.4) {
    const fav = formDiff > 0 ? "{home}" : "{away}";
    const t = formDiff > 0 ? homeTrend : awayTrend;
    signals.push({
      score: Math.abs(formDiff) * 4,
      text: `${fav} 최근 5경기 폼 우위 (경기당 ${t.ppg.toFixed(1)}점·득점 ${t.avgGoalsFor.toFixed(1)})`,
    });
  }
  const haDiff = homeHA.home.ppg - awayHA.away.ppg;
  if (Math.abs(haDiff) >= 0.3) {
    const fav = haDiff > 0 ? "{home} 홈" : "{away} 원정";
    signals.push({
      score: Math.abs(haDiff) * 3,
      text: `${fav} 강세 (홈 ${homeHA.home.ppg.toFixed(1)}점 / 원정 ${awayHA.away.ppg.toFixed(1)}점)`,
    });
  }
  if (h2h.total >= 3 && Math.abs(h2h.homeTeamWins - h2h.awayTeamWins) >= 2) {
    const fav = h2h.homeTeamWins > h2h.awayTeamWins ? "{home}" : "{away}";
    signals.push({
      score: (Math.abs(h2h.homeTeamWins - h2h.awayTeamWins) / h2h.total) * 4,
      text: `상대전적 ${fav} 우세 (최근 ${h2h.total}경기 ${h2h.homeTeamWins}-${h2h.draws}-${h2h.awayTeamWins})`,
    });
  }
  const homeRun = Math.max(homeStreak.winningRun, homeStreak.losingRun);
  const awayRun = Math.max(awayStreak.winningRun, awayStreak.losingRun);
  if (homeRun >= 3 || awayRun >= 3) {
    if (homeRun >= awayRun && homeRun >= 3) {
      const kind = homeStreak.winningRun >= 3 ? `${homeStreak.winningRun}연승` : `${homeStreak.losingRun}연패`;
      signals.push({ score: homeRun, text: `{home} ${kind} 흐름` });
    } else if (awayRun >= 3) {
      const kind = awayStreak.winningRun >= 3 ? `${awayStreak.winningRun}연승` : `${awayStreak.losingRun}연패`;
      signals.push({ score: awayRun, text: `{away} ${kind} 흐름` });
    }
  }
  const keyReasons = signals
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.text);

  return {
    elo: { home: homeElo, away: awayElo },
    winProb: { home: wp.home, draw: wp.draw, away: wp.away },
    ouMarket: ouMarket
      ? {
          line: ouMarket.line,
          expectedTotal: ouMarket.expectedTotal,
          pOver: ouMarket.pOver,
          pick: ouMarket.pOver >= 0.5 ? ("OVER" as const) : ("UNDER" as const),
        }
      : undefined,
    handicapMarket: hcMarket
      ? { pick: hcMarket.pick, line: hcMarket.line, prob: hcMarket.prob }
      : undefined,
    doubleChance: dcMarket
      ? { pick: dcMarket.pick, prob: dcMarket.prob }
      : undefined,
    btts: bttsMarket
      ? {
          pick: bttsMarket.pBtts >= 0.5 ? ("YES" as const) : ("NO" as const),
          prob: bttsMarket.pBtts,
        }
      : undefined,
    confidence,
    dataSparse,
    restDays,
    keyReasons: keyReasons.length > 0 ? keyReasons : undefined,
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
    // 승·무·패 기록 — 야구 프리뷰는 승점(3/1/0 환산) 대신 이걸로 순위를 서술한다.
    record:
      homeRow && awayRow
        ? {
            home: { wins: homeRow.wins, draws: homeRow.draws, losses: homeRow.losses },
            away: { wins: awayRow.wins, draws: awayRow.draws, losses: awayRow.losses },
          }
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
