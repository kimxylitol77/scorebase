// 시작 전·연기 경기에 남은 점수를 지운다 — 표시층·수집층 게이트를 통과해 굳은 잔여값 정리.
//
// 배경. thesports-matches 라우트는 숫자만 update 하고 null 은 보존해서, 킥오프 직전에 들어온
// 0-0 이 연기로 바뀐 뒤에도 영영 남는다. 라우트에 POSTPONED 가드를 넣었지만(2026-08-22)
// 이미 굳은 값은 다음 수집에서 자동 정정되지 않으므로 한 번 훑는다.
//
//   npx tsx scripts/cleanup-pregame-scores.ts [--apply]
import "@/lib/env";
import { prisma } from "@/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const now = new Date();
  const targets = await prisma.match.findMany({
    where: {
      OR: [
        { status: "POSTPONED", NOT: { homeScore: null, awayScore: null } },
        { status: "SCHEDULED", startTime: { gt: now }, NOT: { homeScore: null, awayScore: null } },
      ],
    },
    select: { id: true, league: true, status: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  // 0-0 이 아닌 값은 실제 경기 결과일 수 있다(연기 전 중단 등) — 지우지 않고 보고만 한다.
  const zero = targets.filter((m) => (m.homeScore ?? 0) === 0 && (m.awayScore ?? 0) === 0);
  const nonZero = targets.filter((m) => !((m.homeScore ?? 0) === 0 && (m.awayScore ?? 0) === 0));

  const byLg = new Map<string, number>();
  for (const m of zero) byLg.set(m.league, (byLg.get(m.league) ?? 0) + 1);
  console.log(`대상 ${targets.length} · 0-0 정리 ${zero.length} · 보류(0-0 아님) ${nonZero.length}`);
  console.log("리그:", [...byLg].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([l, n]) => `${l}:${n}`).join(" "));
  if (nonZero.length) {
    console.log("\n보류 목록 — 실제 결과일 수 있어 손대지 않는다:");
    for (const m of nonZero.slice(0, 20)) {
      console.log(`  #${m.id} ${m.league} ${m.status} ${m.homeTeam.name} ${m.homeScore}:${m.awayScore} ${m.awayTeam.name}`);
    }
  }
  if (!APPLY) {
    console.log("\n--apply 없이는 쓰지 않는다 (dry-run)");
    await prisma.$disconnect();
    return;
  }
  for (let i = 0; i < zero.length; i += 100) {
    await prisma.match.updateMany({
      where: { id: { in: zero.slice(i, i + 100).map((m) => m.id) } },
      data: { homeScore: null, awayScore: null },
    });
  }
  console.log(`\n${zero.length}건 정리 완료`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
