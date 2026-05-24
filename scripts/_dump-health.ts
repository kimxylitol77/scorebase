import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 가장 최근 cron 의 row 들 = 마지막 1시간 내
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const rows = await prisma.healthCheck.findMany({
    where: { runAt: { gte: since } },
    orderBy: [{ runAt: "desc" }],
  });

  if (rows.length === 0) {
    console.log("최근 1시간 내 HealthCheck row 없음 — 6h window 로 재시도");
    const since2 = new Date(Date.now() - 6 * 3600 * 1000);
    const rows2 = await prisma.healthCheck.findMany({
      where: { runAt: { gte: since2 } },
      orderBy: [{ runAt: "desc" }],
    });
    console.log(`6h: ${rows2.length} rows`);
    if (rows2.length === 0) return;
    rows.push(...rows2);
  }

  // 가장 최근 batch = 같은 runAt 분 단위
  const newest = rows[0].runAt;
  const batchStart = new Date(newest.getTime() - 5 * 60 * 1000);
  const batch = rows.filter((r) => r.runAt >= batchStart);

  const high = batch.filter((r) => r.severity === "HIGH");
  const med = batch.filter((r) => r.severity === "MED");
  const low = batch.filter((r) => r.severity === "LOW");
  const ok = batch.filter((r) => r.severity === "OK");

  console.log(`\n=== 가장 최근 batch (${batch[0].runAt.toISOString()} 기준 5분 window) ===`);
  console.log(`총 ${batch.length}건 — HIGH ${high.length} · MED ${med.length} · LOW ${low.length} · OK ${ok.length}\n`);

  const byCategory = (items: typeof rows) => {
    const map = new Map<string, typeof rows>();
    for (const r of items) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return map;
  };

  console.log("─".repeat(80));
  console.log("🚨 HIGH 상세");
  console.log("─".repeat(80));
  for (const [cat, items] of byCategory(high)) {
    console.log(`\n▼ [${cat}] ${items.length}건`);
    for (const r of items) {
      console.log(`  • ${r.key}: ${r.message}`);
    }
  }

  console.log("\n" + "─".repeat(80));
  console.log("⚠️  MED 상세");
  console.log("─".repeat(80));
  for (const [cat, items] of byCategory(med)) {
    console.log(`\n▼ [${cat}] ${items.length}건`);
    for (const r of items) {
      console.log(`  • ${r.key}: ${r.message}`);
    }
  }

  if (low.length > 0) {
    console.log("\n" + "─".repeat(80));
    console.log("ℹ️  LOW 상세");
    console.log("─".repeat(80));
    for (const [cat, items] of byCategory(low)) {
      console.log(`\n▼ [${cat}] ${items.length}건`);
      for (const r of items) {
        console.log(`  • ${r.key}: ${r.message}`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
