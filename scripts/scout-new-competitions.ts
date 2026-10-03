// 신규 대회 후보 점검 — 향후 14일 원천 일정 중 우리에게 없는 대회를 점수순으로 보여 준다.
//   npx tsx --env-file=.env.local scripts/scout-new-competitions.ts           # 한국 관련 전부 + 상위 5
//   npx tsx --env-file=.env.local scripts/scout-new-competitions.ts --top=20
// 수집·점수 로직은 lib/sports/new-competition-scout.ts·new-competition-score.ts (주간 cron 과 공용).
import "@/lib/env";
import { prisma } from "@/lib/db";
import { scoutNewCompetitions } from "@/lib/sports/new-competition-scout";
import { rankCandidates } from "@/lib/sports/new-competition-score";

const TOP = Number(process.argv.find((a) => a.startsWith("--top="))?.split("=")[1] ?? 5);

async function main() {
  const all = await scoutNewCompetitions({ budgetMs: 600_000 });
  const ranked = rankCandidates(all, TOP);
  console.log(`미매핑 대회 ${all.length}개 → 후보 ${ranked.length}개`);
  for (const c of ranked) console.log(`${String(c.score).padStart(5)} [${c.source} ${c.id}] ${c.name} (${c.country || "-"}) ${c.matches}경기${c.national ? " · 대표팀" : ""}${c.korea.length ? " · 한국: " + c.korea.join(", ") : ""}`);
  await prisma.$disconnect();
}
main();
