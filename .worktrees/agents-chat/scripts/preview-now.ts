// 야구 PREVIEW 즉시 발행 (선발 투수 확정 직후 빠른 발행용).
//
// 사용:
//   npm run preview:kbo           — KBO 만
//   npm run preview:npb           — NPB 만
//   npm run preview:mlb           — MLB 만
//   npm run preview:baseball      — KBO + NPB + MLB 순차
//
// 호출 흐름: runPreview({ league, horizonDays: 1 })
// - status=SCHEDULED + 1일 내 시작 + PREVIEW 없는 매치만 픽업
// - 이미 PREVIEW 있는 매치는 skip (중복 발행 방지)
// - starter ERA 있으면 Poisson 차트도 자동 채움

import { runPreview } from "../src/jobs/generate-previews";

async function main() {
  const arg = process.argv[2]?.toUpperCase();
  const LEAGUES = ["KBO", "NPB", "MLB"];
  const targets = arg === "ALL" || !arg ? LEAGUES : [arg];
  for (const lg of targets) {
    if (!LEAGUES.includes(lg)) {
      console.warn(`[preview-now] 알 수 없는 리그: ${lg} (KBO/NPB/MLB/ALL 만 지원)`);
      continue;
    }
    console.log(`\n=== ${lg} PREVIEW 발행 시작 ===`);
    await runPreview({ league: lg, horizonDays: 1 });
  }
  console.log("\n[preview-now] 완료");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
