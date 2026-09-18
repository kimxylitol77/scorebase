// DailyTraffic 과거분 채우기 — 첫 PV 기록일부터 어제까지 하루씩 판정해 저장(판정 규칙이 바뀌면 다시 돌린다).
// 사용: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/backfill-daily-traffic.ts [시작일 YYYY-MM-DD]
import { prisma } from "@/lib/db";
import { kstDayKey, storeDayTraffic } from "@/lib/admin/daily-traffic";

async function main() {
  const first = process.argv[2] ?? kstDayKey((await prisma.pageView.findFirst({ orderBy: { ts: "asc" }, select: { ts: true } }))!.ts);
  const yesterday = kstDayKey(new Date(Date.now() - 24 * 3600 * 1000));
  for (let d = first; d <= yesterday; d = kstDayKey(new Date(new Date(`${d}T12:00:00+09:00`).getTime() + 24 * 3600 * 1000))) {
    const v = await storeDayTraffic(d);
    console.log(d, v.visitors, v.pv);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
