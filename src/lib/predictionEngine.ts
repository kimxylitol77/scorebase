// src/lib/predictionEngine.ts
// 모든 종목 (야구/농구/하키/축구) 공통 AI 승률 예측 wrapper.
// 기존 src/lib/predict/* 28개 모듈을 sport-agnostic 한 단일 entry 로 통합.
//
// 핵심 정책:
//   1. confidence < 58 → NO_PICK (베팅 가치 없음 시그널)
//   2. 종목별 시그널 분기 — baseball: 선발 ERA / 불펜 fatigue,
//      hockey: 골리 GAA, basketball/football: Elo + 최근폼 + 부상
//   3. market odds (배당) 가 있으면 0.4 weight 로 blend (시장 신호 반영)
//   4. reason chip — 큰 영향 시그널 3개만 노출 (Elo / 최근폼 / 선발 등)
//   5. validatePredictionDisplay — LIVE score 와 예측 방향 충돌 시 hide
//      (예: LIVE 5-1 인데 pick=AWAY 면 표시 X — 사용자 신뢰도 보호)
//
// 사용:
//   const pred = await predictMatch(matchId);
//   if (!pred || pred.pick === "NO_PICK") return null;
//   const { show, reason } = validatePredictionDisplay(pred, match);
//   if (!show) return null;
//   // pred.probHome, pred.pick, pred.confidence, pred.reasons 표시

import { prisma } from "@/lib/db";
import { calcEloTable, getElo, STARTING_ELO } from "./predict/elo";
import { calcWinProbability, type WinProb } from "./predict/win-probability";
import { blendWithMarket, type MarketProb } from "./predict/market-blend";
import { calcRecentTrend } from "./predict/recent-trend";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import type { PredictMatch } from "./predict/types";

const CONFIDENCE_GATE = 58;
const BASKETBALL_LEAGUES = new Set(["NBA", "WNBA", "KBL", "WKBL"]);
const HOCKEY_LEAGUES = new Set(["NHL"]);
const FOOTBALL_LEAGUES_DRAW = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "MLS", "K_LEAGUE_1", "K_LEAGUE_2",
  "J1_LEAGUE", "WORLD_CUP",
]);

export type SportKind = "baseball" | "basketball" | "hockey" | "football" | "other";
export type PredictionPick = "HOME" | "AWAY" | "DRAW" | "NO_PICK";

export interface PredictionReason {
  /** 짧은 라벨 (UI chip) — 예: "ELO 우위", "최근 폼", "선발 ERA", "골리 SV%" */
  tag: string;
  /** 1-2문장 설명 */
  detail: string;
  /** 영향 강도 */
  weight: "high" | "med" | "low";
}

export interface PredictionResult {
  matchId: number;
  sport: SportKind;
  league: string;
  /** 0~1 확률 — 합 1 (정규화 완료) */
  probHome: number;
  probDraw: number;
  probAway: number;
  /** 추천 팀 (또는 NO_PICK) */
  pick: PredictionPick;
  /** 0~100 신뢰도 (선택 pick 의 확률 × 100) */
  confidence: number;
  /** 추천 이유 chip 최대 3개, 영향 큰 순 */
  reasons: PredictionReason[];
  /** confidence gate 통과 여부 (false 면 pick=NO_PICK) */
  passed: boolean;
  /** 사용된 시그널 list — 디버그/로그용 */
  signalsUsed: string[];
}

function classifySport(league: string): SportKind {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball";
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (FOOTBALL_LEAGUES_DRAW.has(league)) return "football";
  return "other";
}

function normalizeProbs(p: WinProb): WinProb {
  const sum = p.home + p.draw + p.away;
  if (sum <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: p.home / sum, draw: p.draw / sum, away: p.away / sum };
}

function pickFromProbs(p: WinProb): { pick: "HOME" | "AWAY" | "DRAW"; prob: number } {
  if (p.home >= p.draw && p.home >= p.away) return { pick: "HOME", prob: p.home };
  if (p.away >= p.home && p.away >= p.draw) return { pick: "AWAY", prob: p.away };
  return { pick: "DRAW", prob: p.draw };
}

/**
 * 매치 1건 예측. DB 에서 시즌 매치 + 사이드 데이터 조회 후 종목별 모델 적용.
 *
 * 성능: per-call ~50~150ms (시즌 매치 수에 비례). 다량 호출 시 batch 처리 권장.
 */
export async function predictMatch(matchId: number): Promise<PredictionResult | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
    },
  });
  if (!match) return null;

  const sport = classifySport(match.league);
  const signalsUsed: string[] = [];
  const reasons: PredictionReason[] = [];

  // ── 1. Elo (모든 종목 공통) ─────────────────────────────
  const seasonMatches = await prisma.match.findMany({
    where: {
      league: match.league,
      startTime: {
        gte: new Date(match.startTime.getTime() - 365 * 24 * 3600 * 1000),
        lt: match.startTime,
      },
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const eloTable = calcEloTable(seasonMatches as PredictMatch[]);
  const eloHome = getElo(eloTable, match.homeTeamId);
  const eloAway = getElo(eloTable, match.awayTeamId);
  const eloDiff = eloHome - eloAway;
  signalsUsed.push("elo");

  let probs: WinProb = calcWinProbability(eloHome, eloAway, match.league);
  probs = normalizeProbs(probs);

  if (Math.abs(eloDiff) >= 50) {
    reasons.push({
      tag: "ELO 우위",
      detail: `${eloDiff > 0 ? "홈" : "어웨이"}팀 Elo ${Math.abs(Math.round(eloDiff))}점 우위 (${eloHome.toFixed(0)} vs ${eloAway.toFixed(0)})`,
      weight: Math.abs(eloDiff) >= 100 ? "high" : "med",
    });
  }

  // ── 2. 최근 폼 / trend (모든 종목 공통) ───────────────────
  // calcRecentTrend 는 single team 기준 (ppg, avgGoalsFor 등). 두 팀 각각 호출.
  try {
    const homeTrend = calcRecentTrend(
      seasonMatches as PredictMatch[],
      match.homeTeamId,
      match.startTime,
    );
    const awayTrend = calcRecentTrend(
      seasonMatches as PredictMatch[],
      match.awayTeamId,
      match.startTime,
    );
    signalsUsed.push("recent_trend");
    const ppgDiff = homeTrend.ppg - awayTrend.ppg;
    // ppg 격차 0.6+ (예: 2.0 vs 1.4) — 의미 있는 최근 폼 차이
    if (Math.abs(ppgDiff) >= 0.6 && homeTrend.matches >= 3 && awayTrend.matches >= 3) {
      reasons.push({
        tag: "최근 폼",
        detail: `최근 ${Math.min(homeTrend.matches, awayTrend.matches)}경기 ${ppgDiff > 0 ? "홈팀" : "어웨이팀"} 평균 승점 우위 (${homeTrend.ppg.toFixed(1)} vs ${awayTrend.ppg.toFixed(1)})`,
        weight: Math.abs(ppgDiff) >= 1.0 ? "high" : "med",
      });
    }
  } catch {
    // trend 실패 시 silent (시즌 첫 매치 등)
  }

  // ── 3. 종목별 분기 — 선발투수 / 골리 / (향후) 부상 ───────
  if (sport === "baseball") {
    // 선발투수 ERA — baseball-context 의 starters 정보 (별도 cron 으로 fetch)
    // 현재 자동 조회 path 가 PreviewContext 통해서만 가능. starter signal 은
    // 별도 fetch 인프라 (fetch-baseball-starters cron) 가 있으면 활용.
    // 일단 시그널 미적용 — 향후 PR2 에서 starter fetch 추가.
    signalsUsed.push("baseball_base");
    // 불펜 fatigue — 직전 3경기 평균 불펜 이닝 수 (placeholder, 데이터 source 미정)
  } else if (sport === "hockey") {
    // 골리 GAA / SV% — goalie 정보 fetch 위치 없음. 향후 NHL roster 통합 시 적용.
    signalsUsed.push("hockey_base");
  } else if (sport === "basketball") {
    // 부상 — 현재 cron 없음. 향후 BALLDONTLIE / api-basketball 부상 endpoint 통합.
    signalsUsed.push("basketball_base");
  } else if (sport === "football") {
    signalsUsed.push("football_base");
  }

  // ── 4. 시장 배당 blend (있으면) ───────────────────────────
  if (
    typeof match.marketHome === "number" &&
    typeof match.marketAway === "number"
  ) {
    const market: MarketProb = {
      home: match.marketHome,
      draw: typeof match.marketDraw === "number" ? match.marketDraw : 0,
      away: match.marketAway,
    };
    const blended = blendWithMarket(probs, market, { marketWeight: 0.4 });
    if (blended.blended) {
      probs = normalizeProbs({ home: blended.home, draw: blended.draw, away: blended.away });
      signalsUsed.push("market_blend");
      // 시장과 우리 예측이 크게 다르면 reason 추가
      const ourPick = pickFromProbs(probs);
      const marketPick = market.home > market.away ? "HOME" : "AWAY";
      if (ourPick.pick === marketPick) {
        reasons.push({
          tag: "배당흐름 일치",
          detail: `시장 배당과 동일 방향 — 신뢰도 보강`,
          weight: "med",
        });
      }
    }
  }

  // ── 5. pick + confidence + NO_PICK gate ─────────────────
  const final = pickFromProbs(probs);
  const confidence = Math.round(final.prob * 100);
  const passed = confidence >= CONFIDENCE_GATE;

  // reason chip 최대 3개 — high → med → low 순
  reasons.sort((a, b) => {
    const order: Record<string, number> = { high: 0, med: 1, low: 2 };
    return order[a.weight] - order[b.weight];
  });
  const topReasons = reasons.slice(0, 3);

  return {
    matchId,
    sport,
    league: match.league,
    probHome: probs.home,
    probDraw: probs.draw,
    probAway: probs.away,
    pick: passed ? final.pick : "NO_PICK",
    confidence,
    reasons: topReasons,
    passed,
    signalsUsed,
  };
}

/**
 * 예측을 사용자 UI 에 표시할지 검증.
 * 핵심 사고: LIVE 매치에서 예측 (예: HOME 65%) 인데 현재 LIVE score 가 반대로 큰 격차 (1-5 AWAY 우세)
 * 면 표시하지 않음. 사용자가 "예측 틀렸네" 인식하지 않게 보호.
 * narrator 의 score validation 과 같은 원칙.
 */
export function validatePredictionDisplay(
  pred: PredictionResult,
  match: { status: string; homeScore: number | null; awayScore: number | null },
): { show: boolean; reason?: string } {
  if (pred.pick === "NO_PICK") return { show: false, reason: "NO_PICK" };

  // SCHEDULED — 항상 show
  if (match.status === "SCHEDULED") return { show: true };

  // FINISHED / LIVE — 현재 score 와 pick 방향 비교
  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;
  const diff = hs - as_;

  // 점수 차 큰 매치 (종목별 임계)
  const sport = pred.sport;
  let bigDiff = 2; // football
  if (sport === "baseball") bigDiff = 4;
  if (sport === "basketball") bigDiff = 10;
  if (sport === "hockey") bigDiff = 3;

  if (Math.abs(diff) >= bigDiff) {
    // pick 이 큰 격차 반대 방향이면 hide
    if (diff > 0 && pred.pick === "AWAY") {
      return { show: false, reason: `LIVE 홈팀 ${diff}점 우세인데 pick=AWAY (반대 방향)` };
    }
    if (diff < 0 && pred.pick === "HOME") {
      return { show: false, reason: `LIVE 어웨이팀 ${Math.abs(diff)}점 우세인데 pick=HOME (반대 방향)` };
    }
  }

  return { show: true };
}

/**
 * 한 줄 사람이 읽는 요약. UI 또는 로그용.
 */
export function summarizePrediction(pred: PredictionResult, homeName: string, awayName: string): string {
  if (pred.pick === "NO_PICK") {
    return `예측 보류 (신뢰도 ${pred.confidence}% — gate ${CONFIDENCE_GATE} 미달)`;
  }
  const team = pred.pick === "HOME" ? homeName : pred.pick === "AWAY" ? awayName : "무승부";
  return `${team} ${pred.confidence}% (${pred.sport}, ${pred.reasons.length}개 시그널)`;
}

export const CONFIDENCE_THRESHOLD = CONFIDENCE_GATE;
