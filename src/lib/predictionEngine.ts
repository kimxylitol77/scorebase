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
import { calcEloTable, getElo, eloSpread } from "./predict/elo";
import { calcLeagueBaseRate, priorWeight } from "./predict/league-prior";
import { calcWinProbability, type WinProb } from "./predict/win-probability";
import { blendWithMarket, type MarketProb } from "./predict/market-blend";
import { calcRecentTrend } from "./predict/recent-trend";
import { fitDixonColes, predictDixonColes, type DcMatch } from "./predict/dixon-coles";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";
import type { PredictMatch } from "./predict/types";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "./predict/starter-adjust";
import {
  computeLineupAdjustment,
  applyLineupToWinProb,
  type LineupAdjustment,
} from "./predict/lineup-adjust";
import {
  computeRestContext,
  computeMotivation,
  type Motivation,
} from "./predict/schedule-context";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { getWorldCupSeedElo } from "./predict/world-cup-elos";
import { getFifaRank } from "@/lib/sports/fifa-rankings";

// 국가대표 Elo — 클럽 시즌 Elo 가 없는 국가대항(WC·친선)용.
// world-cup-elos(본선국 실제 Elo) 우선, 없으면 FIFA랭킹 환산 (build-context 와 동일 공식).
const NATIONAL_TEAM_LEAGUES = new Set(["WORLD_CUP", "INTL_FRIENDLY"]);
function nationalTeamElo(name: string): number {
  const seed = getWorldCupSeedElo(name);
  if (seed != null) return seed;
  const rank = getFifaRank(name);
  if (rank != null) return Math.max(1300, 2050 - 250 * Math.log10(rank));
  return 1500;
}

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
  /** 야구 선발투수 rating 0~100. 50 = league avg. ERA 낮을수록 ↑. (레거시 — starter 없을 때 fallback) */
  starterRating?: number;
  /** 야구 선발 통계 (ERA/WHIP/K9/GS + 최근 3등판). 있으면 starterRating 보다 우선해 정밀 보정 (starter-adjust). */
  starter?: { era?: number; whip?: number; k9?: number; gs?: number; recentEra?: number };
  /** 야구 불펜 fatigue 0~1. 0=쉼, 1=완전 소진. */
  bullpenFatigue?: number;
  /** 하키 골리 rating 0~100. 50 = league avg. SV% 높을수록 ↑. */
  goalieRating?: number;
  /** 축구 — 직전 경기 후 휴식일 (10일 초과는 null, schedule-context). */
  restDays?: number | null;
  /** 축구 — 킥오프 직전 8일간 치른 경기 수 (혼잡 감지). */
  matchesIn8d?: number;
  /** 축구 — 시즌 막판 동기부여 (fight=우승·강등 사투 / dead=중위 무동기). */
  motivation?: "fight" | "dead" | "normal";
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
  /** 리그 실측 1X2 베이스레이트 + 가중 — Elo 분산 작은 리그 과확신 보정 (league-prior.ts). predictMatchById 가 채움. */
  leaguePrior?: { home: number; draw: number; away: number; weight: number };
  /** 축구 확정 XI 평점 보정 (lineup-adjust) — 라인업 확정 후 재계산 시 predictMatchById 가 채움. */
  lineupAdj?: LineupAdjustment | null;
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
  // homeTeamName: WORLD_CUP 중립 구장 판정용 (개최국만 홈 +100) — 타 리그엔 영향 없음.
  let probs = calcWinProbability(home.elo, away.elo, league, { homeTeamName: home.name });
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
    // 선발투수 — ERA/WHIP/K9 정밀 보정 우선 (evaluate-predictions 와 동일 starter-adjust).
    // starter 통계 없으면 레거시 starterRating(숫자) fallback.
    // league 전달 — KBO 는 최근 3등판 recentEra 블렌드 (백테스트 통과, starter-adjust 주석).
    const sAdj = computeStarterAdjustment(home.starter ?? null, away.starter ?? null, league);
    if (sAdj.applied) {
      probs = normalizeProbs(applyStarterToWinProb(probs, sAdj));
      signalsUsed.push("starter");
      const homeBetter = sAdj.homeShift > 0;
      const eraTxt =
        home.starter?.era != null && away.starter?.era != null
          ? ` (ERA ${home.starter.era.toFixed(2)} vs ${away.starter.era.toFixed(2)})`
          : "";
      reasons.push({
        tag: "선발 ERA",
        detail: `${homeBetter ? home.name : away.name} 선발 우위${eraTxt}`,
        weight: Math.abs(sAdj.homeShift) >= 0.08 ? "high" : "med",
      });
    } else if (home.starterRating != null && away.starterRating != null) {
      // 선발투수 rating 차이 — 50 평균, 5+ 차이면 반영
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
  } else if (sport === "football") {
    // 휴식일 격차 — 2일+ 차이에만, 1일당 1%p, cap ±3%p (UEFA 미드위크 연구 일반치 보수 적용)
    if (home.restDays != null && away.restDays != null) {
      const rd = home.restDays - away.restDays;
      if (Math.abs(rd) >= 2) {
        const shift = Math.max(-0.03, Math.min(0.03, rd * 0.01));
        probs = normalizeProbs({
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        });
        signalsUsed.push("rest");
        reasons.push({
          tag: "휴식일",
          detail: `${rd > 0 ? home.name : away.name} 휴식 우위 (${home.restDays}일 vs ${away.restDays}일)`,
          weight: "low",
        });
      }
    }
    // 일정 혼잡 — 8일 3경기+ 인데 상대는 아닐 때 2%p
    if (home.matchesIn8d != null && away.matchesIn8d != null) {
      const homeCongested = home.matchesIn8d >= 3 && away.matchesIn8d < 3;
      const awayCongested = away.matchesIn8d >= 3 && home.matchesIn8d < 3;
      if (homeCongested || awayCongested) {
        const shift = homeCongested ? -0.02 : 0.02;
        probs = normalizeProbs({
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        });
        signalsUsed.push("congestion");
        reasons.push({
          tag: "일정 혼잡",
          detail: `${homeCongested ? home.name : away.name} 8일 내 3경기 강행군 (${home.matchesIn8d} vs ${away.matchesIn8d}경기)`,
          weight: "low",
        });
      }
    }
    // 시즌 막판 동기부여 — fight(우승·강등 사투) vs dead(중위 무동기) 격차에만 4%p
    if (home.motivation && away.motivation && home.motivation !== away.motivation) {
      const homeFight = home.motivation === "fight" && away.motivation === "dead";
      const awayFight = away.motivation === "fight" && home.motivation === "dead";
      if (homeFight || awayFight) {
        const shift = homeFight ? 0.04 : -0.04;
        probs = normalizeProbs({
          home: clamp01(probs.home + shift),
          draw: probs.draw,
          away: clamp01(probs.away - shift),
        });
        signalsUsed.push("motivation");
        reasons.push({
          tag: "동기부여",
          detail: `${homeFight ? home.name : away.name} 순위 사투 중 — 상대는 중위 안착 (시즌 막판)`,
          weight: "med",
        });
      }
    }
    // 확정 XI 평점 보정 (lineup-adjust) — MLB starter 와 평행. 라인업 확정 후
    // 재계산 트리거에서만 입력됨 (TheSports lineup 평점 기반, ±1.5%p 미만 노이즈 무시).
    const lAdj = input.lineupAdj;
    if (lAdj?.applied && Math.abs(lAdj.homeShift) >= 0.015) {
      probs = normalizeProbs(applyLineupToWinProb(probs, lAdj));
      signalsUsed.push("lineup");
      const betterHome = lAdj.homeShift > 0;
      const fmt = (g: number) => `${g >= 0 ? "+" : ""}${g.toFixed(1)}`;
      reasons.push({
        tag: "선발 라인업",
        detail: `${betterHome ? home.name : away.name} 평소 베스트 전력에 근접 (XI 평점 갭 ${fmt(lAdj.homeGap)} vs ${fmt(lAdj.awayGap)})`,
        weight: Math.abs(lAdj.homeShift) >= 0.05 ? "high" : "med",
      });
    }
  }

  // ── 4.5 리그 베이스레이트 prior ──────────────────────────
  // Elo 분산이 작은(수집 이력 부족) 리그는 모델 신호가 약해 홈어드밴티지만 작동
  // → 리그 실측 분포로 후퇴. 정상 리그는 weight 0 이라 no-op. 시장 blend 보다 먼저
  // 적용해 시장 있는 리그에선 시장 60% + (모델·prior 혼합) 40% 구조 유지.
  const lp = input.leaguePrior;
  if (lp && lp.weight > 0) {
    probs = normalizeProbs({
      home: probs.home * (1 - lp.weight) + lp.home * lp.weight,
      draw: probs.draw * (1 - lp.weight) + lp.draw * lp.weight,
      away: probs.away * (1 - lp.weight) + lp.away * lp.weight,
    });
    signalsUsed.push("league_prior");
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

/** Match.homeStarter JSON → 선발 통계 (예측 보정용). 파싱 실패/null 이면 undefined. */
function parseStarterStats(
  json: string | null,
): { era?: number; whip?: number; k9?: number; gs?: number; recentEra?: number } | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as {
      era?: number;
      whip?: number;
      k9?: number;
      gs?: number;
      recentEra?: number;
    };
  } catch {
    return undefined;
  }
}

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
      homeStarter: true,
      awayStarter: true,
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
      fixtureStats: true,
    },
  });
  // xG 추출 — af /fixtures/statistics 는 [home, away] 순서 고정 (2026-06-10 394/394 검증).
  // xG 없는 매치(아시아 리그·과거분)는 null → calcEloTable 이 기존 골 마진과 동일 동작.
  const seasonMatchesTyped: PredictMatch[] = seasonMatches.map((m) => {
    let xgHome: number | null = null;
    let xgAway: number | null = null;
    if (m.fixtureStats) {
      try {
        const fs = JSON.parse(m.fixtureStats) as { expectedGoals?: number }[];
        if (Array.isArray(fs) && fs.length === 2) {
          xgHome = fs[0]?.expectedGoals ?? null;
          xgAway = fs[1]?.expectedGoals ?? null;
        }
      } catch {
        // 손상 JSON — xG 없이 진행
      }
    }
    const { fixtureStats: _fs, ...rest } = m;
    return { ...rest, xgHome, xgAway };
  });

  // Elo — 국가대항(WC·친선)은 클럽 시즌 매치가 없어 calcEloTable 이 전팀 1500 으로
  // 평준화됨 (2026-06-10: WC 매치 predHome null 원인) → 국가대표 Elo 로 대체.
  const eloTable = calcEloTable(seasonMatchesTyped);
  const isNationalTeam = NATIONAL_TEAM_LEAGUES.has(match.league);
  const eloHome = isNationalTeam
    ? nationalTeamElo(match.homeTeam.name)
    : getElo(eloTable, match.homeTeamId);
  const eloAway = isNationalTeam
    ? nationalTeamElo(match.awayTeam.name)
    : getElo(eloTable, match.awayTeamId);

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

  // 축구 확정 XI 평점 보정 — 라인업(cache.lineup confirmed=1) 있을 때만 applied.
  // 라인업 확정 전 호출(프리뷰 등)은 EMPTY 라 기존과 동일 동작.
  const lineupAdj =
    sport === "football"
      ? await computeLineupAdjustment(
          match.id,
          match.homeTeamId,
          match.awayTeamId,
          match.startTime,
        ).catch(() => null)
      : null;

  // 축구 휴식·혼잡 (이미 로드한 시즌 매치에서 계산 — 추가 쿼리 0) + 시즌 막판 동기부여.
  let homeRest: ReturnType<typeof computeRestContext> | null = null;
  let awayRest: ReturnType<typeof computeRestContext> | null = null;
  let homeMotivation: Motivation | undefined;
  let awayMotivation: Motivation | undefined;
  if (sport === "football") {
    homeRest = computeRestContext(seasonMatchesTyped, match.homeTeamId, match.startTime);
    awayRest = computeRestContext(seasonMatchesTyped, match.awayTeamId, match.startTime);
    try {
      const standings = await getFullStandings(match.league);
      if (standings.length >= 10) {
        const homeRow = standings.find((r) => r.teamId === match.homeTeamId) ?? null;
        const awayRow = standings.find((r) => r.teamId === match.awayTeamId) ?? null;
        homeMotivation = computeMotivation(homeRow, standings.length);
        awayMotivation = computeMotivation(awayRow, standings.length);
      }
    } catch {
      // standings 없음 (국가대항·컵) — motivation 미적용
    }
  }

  return predictMatch({
    sport,
    league: match.league,
    home: {
      name: match.homeTeam.name,
      elo: eloHome,
      recentForm: homeForm,
      // 야구 선발 ERA/WHIP/K9 — 있으면 predictMatch 가 starter-adjust 로 보정 (골리/부상은 Phase 3).
      starter: parseStarterStats(match.homeStarter),
      restDays: homeRest?.restDays,
      matchesIn8d: homeRest?.matchesIn8d,
      motivation: homeMotivation,
    },
    away: {
      name: match.awayTeam.name,
      elo: eloAway,
      recentForm: awayForm,
      starter: parseStarterStats(match.awayStarter),
      restDays: awayRest?.restDays,
      matchesIn8d: awayRest?.matchesIn8d,
      motivation: awayMotivation,
    },
    odds,
    dc,
    lineupAdj,
    leaguePrior: (() => {
      // Elo 분산 작은 리그 베이스레이트 후퇴 — buildMatchContext(cron 경로)와 동일 보정
      const base = calcLeagueBaseRate(seasonMatchesTyped, match.startTime);
      const w = priorWeight(eloSpread(eloTable));
      return base && w > 0 ? { ...base, weight: w } : undefined;
    })(),
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
