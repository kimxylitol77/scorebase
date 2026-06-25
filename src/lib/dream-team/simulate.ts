// 드림팀 경기 시뮬 — 팀 공격력/수비력 매치업으로 1X2 확률(경기 전 예측)과 포아송 스코어(결과)를 산출.
import { calcWinProbability, type WinProb } from "@/lib/predict/win-probability";
import { teamOvrToElo } from "./ovr-to-elo";
import { getMentality, type TeamPower } from "./tactics";

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

export function simulateMatch(
  my: TeamPower,
  opp: TeamPower,
  seed: number,
  myMentality = "balanced",
  oppMentality = "balanced",
): MatchSimResult {
  // 승률 예측(표시용)은 팀 종합 전력(공·수 평균)으로 — 중립 경기 양방향 평균 + 축구 무승부율(EPL)
  const myOvrElo = teamOvrToElo((my.atk + my.def) / 2);
  const oppOvrElo = teamOvrToElo((opp.atk + opp.def) / 2);
  const pA = calcWinProbability(myOvrElo, oppOvrElo, "EPL");
  const pB = calcWinProbability(oppOvrElo, myOvrElo, "EPL");
  const prob: WinProb = {
    home: (pA.home + pB.away) / 2,
    draw: (pA.draw + pB.draw) / 2,
    away: (pA.away + pB.home) / 2,
  };

  const mm = getMentality(myMentality);
  const om = getMentality(oppMentality);
  const next = makeRng(seed);
  // 득점 람다는 공격력 vs 상대 수비력 매치업으로. 양 팀이 독립적이라 둘 다 강하면 난타전.
  const myAtkDiff = (teamOvrToElo(my.atk) - teamOvrToElo(opp.def)) / 400;
  const oppAtkDiff = (teamOvrToElo(opp.atk) - teamOvrToElo(my.def)) / 400;
  // 멘탈리티 계수: 내 공격성(atk)은 내 득점↑, 내 수비 노출(exp)은 상대 득점↑.
  const lamMy = 1.35 * Math.pow(10, myAtkDiff * 0.5) * mm.atk * om.exp;
  const lamOpp = 1.35 * Math.pow(10, oppAtkDiff * 0.5) * om.atk * mm.exp;
  const myScore = poisson(lamMy, next);
  const oppScore = poisson(lamOpp, next);
  const outcome = myScore > oppScore ? "win" : myScore < oppScore ? "loss" : "draw";

  return { myScore, oppScore, outcome, prob };
}
