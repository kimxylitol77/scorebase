// 축구 리그 일정 공백 전수 점검 — "원천(TheSports·api-football)엔 경기가 있는데 우리 DB 엔 없는" 리그를 찾는다.
//   npx tsx --env-file=.env.local scripts/audit-league-schedule-gaps.ts            # 향후 30일
//   npx tsx --env-file=.env.local scripts/audit-league-schedule-gaps.ts --days=21
// 판정 로직은 src/lib/sports/schedule-gap-audit.ts (매일 cron schedule-gap-audit 와 공용).
import "@/lib/env";
import { prisma } from "@/lib/db";
import { auditScheduleGaps, formatGap } from "@/lib/sports/schedule-gap-audit";

const DAYS = Number(process.argv.find((a) => a.startsWith("--days="))?.split("=")[1] ?? 30);

async function main() {
  console.log(`축구 리그 일정 공백 점검 · 향후 ${DAYS}일…`);
  const gaps = await auditScheduleGaps({ days: DAYS, budgetMs: 600_000 });
  console.log(`\n공백 의심 ${gaps.length}개`);
  for (const g of gaps) console.log(formatGap(g));
  await prisma.$disconnect();
}
main();
