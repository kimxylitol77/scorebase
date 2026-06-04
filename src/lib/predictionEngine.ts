// src/lib/predictionEngine.ts
// 모든 종목 (야구/농구/하키/축구) 공통 AI 승률 예측 wrapper.
//
// 두 가지 entry:
//   1) predictMatch(input)    — 순수 함수. 호출 측이 sport/home/away 데이터 준비.
//                               UI / 테스트 / 다른 source 통합에 자유.
//   2) predictMatchById(id)   — DB 조회 + 기존 src/lib/predict/* 모듈 활용해서
//                               input 자동 빌드 후 predictMatch 호출.
//
// 사용 예 (사용자 요청 시그니처):
//   const pred = predictMatch({
//     sport: "baseball",
//     home: { name, elo: 1520, recentForm: 0.6, injuryImpact: 0, starterRating: 55, bullpenFatigue: 0.2 },
//     away: { name, elo: 1480, recentForm: 0.4, injuryImpact: 0.1, starterRating: 48, bullpenFatigue: 0.5 },
//     odds: { home: 0.55, away: 0.42 },
//   });
//
// 핵심 정책:
//   - confidence < 58 → NO_PICK (베팅 가치 없음 시그널)
//   - 종목별 시그널 분기: baseball=선발/불펜, hockey=골리, basketball=부상, football=전체
//   - market odds 가 있으면 0.4 weight 로 blend (시장 신호 반영)
//   - reason chip — 영향 큰 시그널 3개만 노출
//   - validatePredictionDisplay — LIVE score 와 pick 방향 충돌 시 hide

import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "./predict/elo";
import { calcWinProbability, type WinProb } from "./predict/win-probability";
import { blendWithMarket, type MarketProb } from "./predict/market-blend";
import { calcRecentTrend } from "./predict/recent-trend";
import { fitDixonColes, predictDixonColes, type DcMatch } from "./predict/dixon-coles";
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

/**
 * 종목 무관 한 팀의 사이드 입력. fallback 가능한 값은 caller 가 ?? 기본값 처리.
 */
export interface TeamInput {
  name: string;
  /** 0~3000 Elo rating. 기본 1500 권장. */
  elo: number;
  /** 0~1. 최근 폼 정규화 (1=전승, 0=전패). 평균 0.5. */
  recentForm?: number;
  /** 0~1. 부상자 영향 (0=정상, 1=주축 전부 결장). 축구/농구. */
  injuryImpact?: number;
  /** 야구 선발투수 rating 0~100. 50 = league avg. ERA 낮을수록 ↑. */
  starterRating?: number;
  /** 야구 불펜 fatigue 0~1. 0=쉼, 1=완전 소진. */
  bullpenFatigue?: number;
  /** 하키 골리 rating 0~100. 50 = league avg. SV% 높을수록 ↑. */
  goalieRating?: number;
}

/**
 * 한 매치 입력. 배당 (odds.home + odds.away = 1 권장) optional.
 */
export interface PredictionInput {
  sport: SportKind;
  /** 리그 코드 — Elo 휴리스틱의 draw weight 등에 사용. 기본 sport 별 fallback. */
  league?: string;
  home: TeamInput;
  away: TeamInput;
  /** 시장 합의 확률 (남은 vig 제거 권장). 없으면 blend skip. */
  odds?: { home: number; away: number; draw?: number };
  /** 축구 Dixon-Coles 득점모델 확률 (있으면 Elo base 와 블렌드). predictMatchById 가 채움. */
  dc?: { home: number; draw: number; away: number };
}

export interface PredictionReason {
  /** UI chip 라벨 — 예: "ELO 우위", "최근 폼", "선발 ERA", "골리 SV%", "배당 일치" */
  tag: string;
  /** 1-2문장 설명 */
  detail: string;
  /** 영향 강도 */
  weight: "high" | "med" | "low";
}

export interface PredictionResult {
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
  /** confidence gate 통과 여부 */
  passed: boolean;
  /** 사용된 시그널 list — 디버그/로그 */
  signalsUsed: string[];
}

// ── helpers ─────────────────────────────────────────────────────

function classifySport(league: string): SportKind {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (BASKETBALL_LEAGUES.has(league)) return "basketball";
  if (HOCKEY_LEAGUES.has(league)) return "hockey";
  if (FOOTBALL_LEAGUES_DRAW.has(league)) return "football";
  return "other";
}

function defaultLeagueFor(sport: SportKind): string {
  if (sport === "baseball") return "MLB";
  if (sport === "basketball") return "NBA";
  if (sport === "hockey") return "NHL";
  if (sport === "football") return "EPL";
  return "EPL";
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

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ── core: 순수 함수 ──────────────────────────────────────────────

/**
 * 한 매치 예측. DB 의존성 없는 순수 함수.
 * 호출 측이 모든 시그널 데이터 준비. 테스트 + 다른 source 통합 자유.
 */
export function predictMatch(input: PredictionInput): PredictionResult {
  const { sport, home, away, odds } = input;
  const league = input.league ?? defaultLeagueFor(sport);
  const signalsUsed: string[] = [];
  const reasons: PredictionReason[] = [];

  // ── 1. Elo 기반 base (모든 종목 공통) ─────────────────
  let probs = calcWinProbability(home.elo, away.elo, league);
  probs = normalizeProbs(probs);
  signalsUsed.push("elo");

  // 축구: Dixon-Coles 득점모델 블렌드. W=0.85 는 grid-search 최적(로그손실 최저, 0.8~0.9 평탄).
  // 순수 DC(1.0)보다 Elo 15% 남기는 게 더 좋음(다양화+크로스컴피티션). 백테스트 1X2 49.3% vs Elo 44.5%.
  // DC 는 표본 적은 팀은 shrinkage 로 리그평균 수렴 → cold-start 안전.
  if (sport === "football" && input.dc) {
    const W = 0.85;
    probs = normalizeProbs({
      home: W * input.dc.home + (1 - W) * probs.home,
      draw: W * input.dc.draw + (1 - W) * probs.draw,
      away: W * input.dc.away + (1 - W) * probs.away,
    });
    signalsUsed.push("dixon_coles");
  }

  const eloDiff = home.elo - away.elo;
  if (Math.abs(eloDiff) >= 50) {
    reasons.push({
      tag: "ELO 우위",
      detail: `${eloDiff > 0 ? home.name : away.name} Elo ${Math.abs(Math.round(eloDiff))}점 우위 (${Math.round(home.elo)} vs ${Math.round(away.elo)})`,
      weight: Math.abs(eloDiff) >= 100 ? "high" : "med",
    });
  }

  // ── 2. 최근 폼 (입력 있으면) ────────────────────────────
  // recentForm 차이 0.2+ → ~10% 확률 shift 효과
  if (home.recentForm != null && away.recentForm != null) {
    const formDiff = home.recentForm - away.recentForm;
    if (Math.abs(formDiff) >= 0.15) {
      const shift = formDiff * 0.15; // max ±15%
      probs = {
        home: clamp01(probs.home + shift),
        draw: probs.draw,
        away: clamp01(probs.away - shift),
      };
      probs = normalizeProbs(probs);
      signalsUsed.push("recent_form");
      reasons.push({
        tag: "최근 폼",
        detail: `${formDiff > 0 ? home.name : away.name} 최근 폼 우위 (${(home.recentForm * 100).toFixed(0)} vs ${(away.recentForm * 100).toFixed(0)})`,
        weight: Math.abs(formDiff) >= 0.3 ? "high" : "med",
      });
    }
  }

  // ── 3. 부상 (입력 있으면, 종목 무관) ───────────────────
  // injuryImpact 0~1 — 큰 쪽이 약화. 0.2+ 격차에만 반영.
  if (home.injuryImpact != null && away.injuryImpact != null) {
    const injDiff = away.injuryImpact - home.injuryImpact; // away 부상 많으면 + (홈 유리)
    if (Math.abs(injDiff) >= 0.2) {
      const shift = injDiff * 0.12;
      probs = {
        home: clamp01(probs.home + shift),
        draw: probs.draw,
        away: clamp01(probs.away - shift),
      };
      probs = normalizeProbs(probs);
      signalsUsed.push("injury");
      reasons.push({
        tag: "부상자",
        detail: `${injDiff > 0 ? away.name : home.name} 부상 영향 큼 (${(home.injuryImpact * 100).toFixed(0)}% vs ${(away.injuryImpact * 100).toFixed(0)}%)`,
        weight: Math.abs(injDiff) >= 0.4 ? "high" : "low",
      });
    }
  }

  // ── 4. 종목별 시그널 분기 ────────────────────────────────
  if (sport === "baseball") {
    // 선발투수 rating 차이 — 50 평균, 5+ 차이면 반영
    if (home.starterRating != null && away.starterRating != null) {
      const diff = home.starterRating - away.starterRating;
      if (Math.abs(diff) >= 5) {
        const shift = (diff / 100) * 0.5; // max ±20% 효과
        probs = {
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        };
        probs = normalizeProbs(probs);
        signalsUsed.push("starter");
        reasons.push({
          tag: "선발투수",
          detail: `${diff > 0 ? home.name : away.name} 선발 우위 (rating ${home.starterRating} vs ${away.starterRating})`,
          weight: Math.abs(diff) >= 15 ? "high" : "med",
        });
      }
    }
    // 불펜 fatigue — 큰 쪽이 약화
    if (home.bullpenFatigue != null && away.bullpenFatigue != null) {
      const diff = away.bullpenFatigue - home.bullpenFatigue;
      if (Math.abs(diff) >= 0.3) {
        const shift = diff * 0.08;
        probs = {
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        };
        probs = normalizeProbs(probs);
        signalsUsed.push("bullpen");
        reasons.push({
          tag: "불펜 피로도",
          detail: `${diff > 0 ? away.name : home.name} 불펜 소진 큼 (${(home.bullpenFatigue * 100).toFixed(0)}% vs ${(away.bullpenFatigue * 100).toFixed(0)}%)`,
          weight: "low",
        });
      }
    }
  } else if (sport === "hockey") {
    // 골리 rating
    if (home.goalieRating != null && away.goalieRating != null) {
      const diff = home.goalieRating - away.goalieRating;
      if (Math.abs(diff) >= 5) {
        const shift = (diff / 100) * 0.4;
        probs = {
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        };
        probs = normalizeProbs(probs);
        signalsUsed.push("goalie");
        reasons.push({
          tag: "골리",
          detail: `${diff > 0 ? home.name : away.name} 골리 우위 (rating ${home.goalieRating} vs ${away.goalieRating})`,
          weight: Math.abs(diff) >= 15 ? "high" : "med",
        });
      }
    }
  }

  // ── 5. 시장 배당 blend ─────────────────────────────────
  if (odds && typeof odds.home === "number" && typeof odds.away === "number") {
    const market: MarketProb = {
      home: odds.home,
      draw: odds.draw ?? 0,
      away: odds.away,
    };
    const blended = blendWithMarket(probs, market, { marketWeight: 0.4 });
    if (blended.blended) {
      probs = normalizeProbs({
        home: blended.home,
        draw: blended.draw,
        away: blended.away,
      });
      signalsUsed.push("market_blend");
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

  // ── 6. pick + confidence + NO_PICK gate ────────────────
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
    sport,
    league,
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

// ── DB wrapper ──────────────────────────────────────────────────

/**
 * matchId 만 받아서 DB 에서 시즌 데이터 + 사이드 신호 자동 빌드 후 predictMatch.
 * Elo + 최근 폼 (calcRecentTrend) 자동 계산.
 * 선발투수 / 골리 / 부상 source 통합은 향후 Phase 3.
 */
export async function predictMatchById(matchId: number): Promise<PredictionResult | null> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      startTime: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return null;

  const sport = classifySport(match.league);

  // 시즌 매치 (1년 window)
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
  const seasonMatchesTyped = seasonMatches as PredictMatch[];

  // Elo
  const eloTable = calcEloTable(seasonMatchesTyped);
  const eloHome = getElo(eloTable, match.homeTeamId);
  const eloAway = getElo(eloTable, match.awayTeamId);

  // 축구 Dixon-Coles 득점모델 (Elo 와 0.7 블렌드). 실패 시 Elo only fallback.
  let dc: { home: number; draw: number; away: number } | undefined;
  if (sport === "football") {
    try {
      const s = fitDixonColes(seasonMatchesTyped as unknown as DcMatch[], match.startTime);
      const p = predictDixonColes(s, match.homeTeamId, match.awayTeamId);
      dc = { home: p.probHome, draw: p.probDraw, away: p.probAway };
    } catch {
      // silent
    }
  }

  // 최근 폼 — ppg 0~3 → 0~1 정규화 (3=전승 ppg)
  let homeForm: number | undefined;
  let awayForm: number | undefined;
  try {
    const ht = calcRecentTrend(seasonMatchesTyped, match.homeTeamId, match.startTime);
    const at = calcRecentTrend(seasonMatchesTyped, match.awayTeamId, match.startTime);
    if (ht.matches >= 3) homeForm = clamp01(ht.ppg / 3);
    if (at.matches >= 3) awayForm = clamp01(at.ppg / 3);
  } catch {
    // silent
  }

  const odds =
    typeof match.marketHome === "number" && typeof match.marketAway === "number"
      ? {
          home: match.marketHome,
          away: match.marketAway,
          draw: typeof match.marketDraw === "number" ? match.marketDraw : undefined,
        }
      : undefined;

  return predictMatch({
    sport,
    league: match.league,
    home: {
      name: match.homeTeam.name,
      elo: eloHome,
      recentForm: homeForm,
      // 선발/골리/부상 — Phase 3 source 통합 시 채움
    },
    away: {
      name: match.awayTeam.name,
      elo: eloAway,
      recentForm: awayForm,
    },
    odds,
    dc,
  });
}

// ── 검증 / 요약 ──────────────────────────────────────────────────

/**
 * 예측을 사용자 UI 에 표시할지 검증.
 * LIVE 매치에서 score 격차가 큰데 pick 이 반대 방향이면 hide.
 * narrator 의 score validation 과 같은 원칙 — 사용자 신뢰도 보호.
 */
export function validatePredictionDisplay(
  pred: PredictionResult,
  match: { status: string; homeScore: number | null; awayScore: number | null },
): { show: boolean; reason?: string } {
  if (pred.pick === "NO_PICK") return { show: false, reason: "NO_PICK" };
  if (match.status === "SCHEDULED") return { show: true };

  const hs = match.homeScore ?? 0;
  const as_ = match.awayScore ?? 0;
  const diff = hs - as_;

  let bigDiff = 2; // football
  if (pred.sport === "baseball") bigDiff = 4;
  if (pred.sport === "basketball") bigDiff = 10;
  if (pred.sport === "hockey") bigDiff = 3;

  if (Math.abs(diff) >= bigDiff) {
    if (diff > 0 && pred.pick === "AWAY") {
      return { show: false, reason: `LIVE 홈팀 ${diff}점 우세인데 pick=AWAY (반대 방향)` };
    }
    if (diff < 0 && pred.pick === "HOME") {
      return { show: false, reason: `LIVE 어웨이팀 ${Math.abs(diff)}점 우세인데 pick=HOME (반대 방향)` };
    }
  }
  return { show: true };
}

export function summarizePrediction(
  pred: PredictionResult,
  homeName: string,
  awayName: string,
): string {
  if (pred.pick === "NO_PICK") {
    return `예측 보류 (신뢰도 ${pred.confidence}% — gate ${CONFIDENCE_GATE} 미달)`;
  }
  const team = pred.pick === "HOME" ? homeName : pred.pick === "AWAY" ? awayName : "무승부";
  return `${team} ${pred.confidence}% (${pred.sport}, ${pred.reasons.length}개 시그널)`;
}

export const CONFIDENCE_THRESHOLD = CONFIDENCE_GATE;
