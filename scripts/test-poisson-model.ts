// 야구 Poisson 모델 검증 스크립트.
//
// 실행: npm run poisson:test   (또는)   npx tsx scripts/test-poisson-model.ts
//
// 5/13 KBO 매치 (KIA vs 삼성, 가상치) 예시로 출력 확인.
// 기대: 삼성 승률 ~58%, 7회 이후 KIA 득점 확률 ↑ (불펜 ERA 격차).

import { calculateInningScoreProbs } from "../src/lib/predict/baseball-poisson";
import { getParkFactor } from "../src/lib/predict/park-factors";

function pct(p: number): string {
  return `${(p * 100).toFixed(1)}%`;
}

function main() {
  const parkFactor = getParkFactor("KBO", "삼성 라이온즈");
  console.log(`park factor (삼성 라이온즈): ${parkFactor}\n`);

  const result = calculateInningScoreProbs({
    team1AvgRpg: 5.2, // KIA (원정)
    team1AvgRApg: 4.8,
    team2AvgRpg: 4.6, // 삼성 (홈)
    team2AvgRApg: 4.1,
    team1StarterEra: 3.45,
    team2StarterEra: 2.45, // 원태인 가정
    team1StarterInnings: 5.5,
    team2StarterInnings: 6.2,
    team1BullpenEra: 4.2,
    team2BullpenEra: 3.85,
    parkFactor, // 1.05
    team1RecentForm: -0.3,
    team2RecentForm: +0.4, // 7연승 가정
  });

  console.log("=== 이닝별 득점 확률 (1점 이상) ===");
  console.log("이닝 | KIA       | 삼성       | 투수");
  console.log("-----+-----------+-----------+--------");
  for (const r of result.inningProbs) {
    const t1 = 1 - r.team1RunProb[0];
    const t2 = 1 - r.team2RunProb[0];
    console.log(
      ` ${String(r.inning).padStart(2)}회 | ${pct(t1).padStart(7)} (${r.team1ExpectedRuns.toFixed(2)}) | ${pct(t2).padStart(7)} (${r.team2ExpectedRuns.toFixed(2)}) | ${r.pitcherFactor}`,
    );
  }

  console.log("\n=== 누적 ===");
  console.log(
    `총 예상 득점 → KIA ${result.totalExpectedRuns.team1.toFixed(2)} · 삼성 ${result.totalExpectedRuns.team2.toFixed(2)}`,
  );
  console.log(
    `모델 승률 (Skellam) → KIA ${pct(result.winProb.team1)} · 삼성 ${pct(result.winProb.team2)}`,
  );

  // 검증: 삼성 승률이 50% 보다 높은지 (홈 + 좋은 선발 + 좋은 폼)
  if (result.winProb.team2 > result.winProb.team1) {
    console.log("\n✓ 삼성 우세 — 예상 시나리오 부합");
  } else {
    console.log("\n⚠ KIA 우세 — 모델 결과 검토 필요");
  }
}

main();
