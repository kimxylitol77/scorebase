// 한 경기의 예측(1X2 + 핸디 + 오버언더 + 더블찬스)을 시점 기반으로 계산한다.
//
// 왜 필요한가. 지금까지 1X2 는 PREVIEW 글 생성이, 핸디·OU·DC 는 경기 종료 후 채점 잡이
//   부수적으로 채웠다. 그래서 **예정 경기에는 예측이 거의 없다**(2026-08-03 실측: 향후 24시간
//   74경기 중 예측 보유 3건, 핸디·OU·DC 는 0건). 경기 전에 픽을 보여주려면 채점과 무관하게
//   계산하는 경로가 있어야 한다.
//
// ⚠️ 계산 순서는 evaluate-predictions.ts 의 runEvaluateMatches 와 같아야 한다. 한쪽만 바꾸면
//   "사전에 보여준 픽"과 "사후 채점된 픽"이 어긋나 적중률이 실제와 달라진다.
//   순서: buildMatchContext → 선발/골리 보정 → 시장 블렌드 → home calibration.
import { buildMatchContext } from "./build-context";
import {
  bestDoubleChance,
  predictTotalMarket,
  predictHandicapMarket,
  getSportProfile,
  SOCCER_LEAGUES_FOR_MARKETS,
} from "./markets";
import { computeStarterAdjustment, applyStarterToWinProb } from "./starter-adjust";
import { computeGoalieAdjustment, applyGoalieToWinProb } from "./goalie-adjust";
import { blendWithMarket } from "./market-blend";
import { calibrateHomeWinProb, hasHomeCalibration } from "./home-calibration";
import type { PredictMatch } from "./types";

/** Elo 가 1500 기본값인 시즌 초반 매치는 픽이 50/50 random 이라 제외한다. */
export const MIN_PRIOR = 5;

export interface PredictionInput {
  id: number;
  league: string;
  homeTeamId: number;
  awayTeamId: number;
  startTime: Date;
  homeStarter: string | null;
  awayStarter: string | null;
  homeGoalie: string | null;
  awayGoalie: string | null;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  marketBookmakers: number | null;
  homeTeam?: { name: string } | null;
}

export interface ComputedPrediction {
  predHome: number;
  predDraw: number;
  predAway: number;
  predWinner: "HOME" | "DRAW" | "AWAY";
  predOverProb?: number;
  predOverPick?: "OVER" | "UNDER";
  predHcLine?: number;
  predHcPick?: "HOME" | "AWAY";
  predHcProb?: number;
  predDcPick?: string;
  predDcProb?: number;
}

const parseJson = <T,>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** 양 팀이 asOf 이전에 치른 경기 수 — MIN_PRIOR 가드용 */
export function priorCount(all: PredictMatch[], teamId: number, asOf: Date): number {
  let n = 0;
  for (const x of all) {
    if (x.startTime >= asOf) continue;
    if (x.homeScore == null || x.awayScore == null) continue;
    if (x.homeTeamId === teamId || x.awayTeamId === teamId) n++;
  }
  return n;
}

/**
 * 계산 불가면 null — 학습 표본 부족(MIN_PRIOR)이거나 컨텍스트가 승률을 못 낸 경우.
 * `all` 은 해당 리그 전체 매치. 각 하위 함수가 asOf(=경기 시작) 이전 데이터만 쓴다.
 */
export function computePrediction(
  m: PredictionInput,
  all: PredictMatch[],
): ComputedPrediction | null {
  // 월드컵은 외부 시드 Elo 라 prior 0 이어도 1500 random 이 아니다 → 가드 면제.
  if (m.league !== "WORLD_CUP") {
    const homePrior = priorCount(all, m.homeTeamId, m.startTime);
    const awayPrior = priorCount(all, m.awayTeamId, m.startTime);
    if (Math.min(homePrior, awayPrior) < MIN_PRIOR) return null;
  }

  const ctx = buildMatchContext(all, m.league, m.homeTeamId, m.awayTeamId, m.startTime);
  let wp = ctx.winProb;
  if (!wp) return null;

  // MLB 선발 투수 / NHL 골리 가중 — league 전달(KBO 는 recentEra 블렌드)
  const sAdj = computeStarterAdjustment(
    parseJson(m.homeStarter),
    parseJson(m.awayStarter),
    m.league,
  );
  const gAdj = computeGoalieAdjustment(parseJson(m.homeGoalie), parseJson(m.awayGoalie));
  if (sAdj.applied) wp = applyStarterToWinProb(wp, sAdj);
  if (gAdj.applied) wp = applyGoalieToWinProb(wp, gAdj);

  // 시장 odds ensemble
  if (m.marketHome != null && m.marketAway != null) {
    wp = blendWithMarket(
      wp,
      { home: m.marketHome, draw: m.marketDraw, away: m.marketAway, bookmakers: m.marketBookmakers },
      { league: m.league },
    );
  }
  // 야구·농구 home 과대 보정
  if (hasHomeCalibration(m.league)) {
    const calHome = calibrateHomeWinProb(wp.home, m.league);
    wp = { home: calHome, draw: 0, away: 1 - calHome };
  }

  const out: ComputedPrediction = {
    predHome: wp.home,
    predDraw: wp.draw,
    predAway: wp.away,
    predWinner:
      wp.home >= wp.away && wp.home >= wp.draw ? "HOME" : wp.away >= wp.draw ? "AWAY" : "DRAW",
  };

  // 오버언더 · 핸디캡 — SPORT_PROFILE 이 있는 리그만
  if (getSportProfile(m.league)) {
    const starter = (s: string | null) => parseJson<{ era?: number }>(s)?.era;
    const total = predictTotalMarket(all, m.league, m.homeTeamId, m.awayTeamId, m.startTime, {
      homeStarterEra: starter(m.homeStarter),
      awayStarterEra: starter(m.awayStarter),
      homeTeamName: m.homeTeam?.name,
    });
    if (total) {
      out.predOverProb = total.pOver;
      out.predOverPick = total.pOver >= 0.5 ? "OVER" : "UNDER";
    }
    const hc = predictHandicapMarket(all, m.league, m.homeTeamId, m.awayTeamId, m.startTime);
    if (hc) {
      out.predHcLine = hc.line;
      out.predHcPick = hc.pick;
      out.predHcProb = hc.prob;
    }
  }

  // 더블찬스 — 무승부가 있는 축구만 의미가 있다
  if (SOCCER_LEAGUES_FOR_MARKETS.has(m.league)) {
    const dc = bestDoubleChance(wp);
    out.predDcPick = dc.pick;
    out.predDcProb = dc.prob;
  }

  return out;
}
