// NBA컵 결승 표시 백필 — ESPN 원본 raw(notes.headline "NBA Cup Championship") 행에 playoffRound=CUP_FINAL.
// 컵 결승은 규정상 정규시즌 기록에 안 들어가는데 ESPN slug 가 regular-season 이라 팀 통계가 83경기로 셌다(2025-26 닉스·스퍼스).
// ts 행은 워커(basketball-match-collector)가 stage "NBA Cup Finals" 로 같은 값을 남긴다. playoffStageId 는 비운다(브라켓 기준점 보호).
// 실행: npx tsx --env-file=.env.local scripts/backfill-nba-cup-final.ts [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";

const DRY = process.argv.includes("--dry");

async function main() {
  const rows = await prisma.match.findMany({
    where: { league: "NBA", raw: { contains: '"headline":"NBA Cup Championship"' } },
    select: { id: true, startTime: true, playoffRound: true },
  });
  const todo = rows.filter((r) => r.playoffRound !== "CUP_FINAL");
  for (const r of todo) console.log(`  #${r.id} ${r.startTime.toISOString().slice(0, 10)} ${r.playoffRound ?? "null"} → CUP_FINAL`);
  if (!DRY && todo.length) await prisma.match.updateMany({ where: { id: { in: todo.map((r) => r.id) } }, data: { playoffRound: "CUP_FINAL" } });
  console.log(`컵 결승 ${rows.length} · 표시 ${todo.length}${DRY ? " (dry)" : ""}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
