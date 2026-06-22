// 드림팀 경기 시뮬 — 두 팀 평균 OVR 로 1X2 확률(경기 전 예측)과 포아송 스코어(결과)를 산출.
import { calcWinProbability, type WinProb } from "@/lib/predict/win-probability";
import { teamOvrToElo } from "./ovr-to-elo";

export interface MatchSimResult {
  myScore: number;
  oppScore: number;
  outcome: "win" | "draw" | "loss";
  prob: WinProb; // 경기 전 예측 (표시용)
}

// seed 기반 deterministic RNG (mulberry32) — 같은 seed=같은 결과(재현·검증용)
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 포아송 분포 샘플 (Knuth)
function poisson(lambda: number, next: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= next();
  } while (p > L);
  return k - 1;
}

export function simulateMatch(myOvr: number, oppOvr: number, seed: number): MatchSimResult {
  const myElo = teamOvrToElo(myOvr);
  const oppElo = teamOvrToElo(oppOvr);
  // 중립 경기 — 양방향 평균으로 홈 어드밴티지 상쇄 + 축구 무승부율(EPL 프로파일)
  const pA = calcWinProbability(myElo, oppElo, "EPL");
  const pB = calcWinProbability(oppElo, myElo, "EPL");
  const prob: WinProb = {
    home: (pA.home + pB.away) / 2,
    draw: (pA.draw + pB.draw) / 2,
    away: (pA.away + pB.home) / 2,
  };

  const next = makeRng(seed);
  const diff = (myElo - oppElo) / 400;
  const lamMy = 1.35 * Math.pow(10, diff * 0.5);
  const lamOpp = 1.35 * Math.pow(10, -diff * 0.5);
  const myScore = poisson(lamMy, next);
  const oppScore = poisson(lamOpp, next);
  const outcome = myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

  return { myScore, oppScore, outcome, prob };
}
