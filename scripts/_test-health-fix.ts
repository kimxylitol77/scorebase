// fix 후 두 체크 결과 비교 — DB insert 없이 함수만 호출.
import { PrismaClient } from "@prisma/client";
import { runHealthChecks } from "../src/lib/health-checks";

const prisma = new PrismaClient();

async function main() {
  const findings = await runHealthChecks();
  const byCategory = new Map<string, typeof findings>();
  for (const f of findings) {
    const arr = byCategory.get(f.category) ?? [];
    arr.push(f);
    byCategory.set(f.category, arr);
  }
  const high = findings.filter((f) => f.severity === "HIGH");
  const med = findings.filter((f) => f.severity === "MED");
  const low = findings.filter((f) => f.severity === "LOW");

  console.log(`\n=== Fix 후 결과 ===`);
  console.log(`총 ${findings.length}건 — HIGH ${high.length} · MED ${med.length} · LOW ${low.length}\n`);

  // leaderboard-consistency / team-name-missing 만 자세히
  for (const cat of ["leaderboard-consistency", "team-name-missing"]) {
    const items = byCategory.get(cat) ?? [];
    console.log(`\n▼ [${cat}] ${items.length}건`);
    for (const f of items) {
      console.log(`  ${f.severity === "HIGH" ? "🚨" : f.severity === "MED" ? "⚠️" : "ℹ️"} ${f.key}: ${f.message}`);
    }
  }

  // 나머지 카테고리 카운트만
  console.log(`\n=== 기타 카테고리 ===`);
  for (const [cat, items] of byCategory) {
    if (cat === "leaderboard-consistency" || cat === "team-name-missing") continue;
    const h = items.filter((i) => i.severity === "HIGH").length;
    const m = items.filter((i) => i.severity === "MED").length;
    console.log(`  ${cat}: HIGH ${h} · MED ${m}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
