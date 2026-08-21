// 기존 PlayerMatchLog 행에 경기별 세부 스탯(슛·키패스·태클·인터셉트·경합·드리블) 백필.
//   2026-08-21 이전 적재분은 af 응답에 있던 세부 스탯을 파서가 버려서 컬럼이 전부 null 이다.
//   fixture 당 af 1콜로 그 경기 전 선수를 한꺼번에 채운다(신규 수집과 같은 엔드포인트).
//   실행: npx tsx --env-file=.env.local scripts/backfill-match-log-details.ts [--limit 800] [--oldest]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { fetchFixturePlayerStats } from "@/lib/sports/api-football-pro";

const CONCURRENCY = 6;
let nextSlot = 0;
async function throttle() {
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + 150;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

const COLS = ["shots", "shotsOn", "passes", "passesAcc", "keyPasses", "tackles", "interceptions", "duelsWon", "duelsTotal", "dribbles", "dribblesAtt"] as const;

async function main() {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf("--limit") + 1]) || 800;
  const oldestFirst = args.includes("--oldest");

  // 세부 스탯이 통째로 비어 있는 fixture 만. 한 fixture 안에서는 전 선수가 같은 응답으로 채워지므로
  //  "그 경기의 어떤 행도 shots 가 없다" = 아직 백필 안 된 경기로 본다.
  const targets: Array<{ fixtureId: number }> = await prisma.$queryRawUnsafe(`
    SELECT "fixtureId"
    FROM "PlayerMatchLog"
    GROUP BY "fixtureId"
    HAVING count("shots") = 0
    ORDER BY max(date) ${oldestFirst ? "ASC" : "DESC"}
    LIMIT ${limit}`);
  if (!targets.length) {
    console.log("백필 대상 없음 — 전부 채워져 있음.");
    return;
  }
  console.log(`대상 fixture ${targets.length}건 (af ${targets.length}콜 예정, ${oldestFirst ? "오래된" : "최근"} 순)`);

  // 청크 단위로 — af 는 동시에 당기되 DB 쓰기는 청크당 UPDATE 한 문장으로 합친다.
  //  (fixture 마다 즉시 쓰면 동시 커넥션 6개가 계속 물려 운영 응답이 느려진다. 2026-08-21 실측:
  //   prod /transfers 가 24 초까지 늘어져 중단했다. 운영과 같은 Neon 을 쓰는 이상 쓰기는 모아서.)
  const CHUNK = 150;
  let updated = 0;
  let emptyFixtures = 0;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const perFixture = await mapPool(chunk, CONCURRENCY, async ({ fixtureId }) => {
      await throttle();
      const stats = await fetchFixturePlayerStats(fixtureId);
      return stats
        .map((s) => ({ tsId: afPlayerToTs(s.playerId), s }))
        .filter((r): r is { tsId: string; s: (typeof stats)[number] } => !!r.tsId && r.s.shots != null)
        .map((r) => `('match:${r.tsId}:${fixtureId}',${COLS.map((c) => Number(r.s[c] ?? 0)).join(",")})`);
    });
    emptyFixtures += perFixture.filter((v) => !v.length).length;
    const values = perFixture.flat();
    if (!values.length) continue;
    const n = await prisma.$executeRawUnsafe(`
      UPDATE "PlayerMatchLog" AS t
      SET ${COLS.map((c, i2) => `"${c}" = v.c${i2}`).join(", ")}
      FROM (VALUES ${values.join(",")}) AS v(id, ${COLS.map((_, i2) => `c${i2}`).join(", ")})
      WHERE t.id = v.id`);
    updated += n;
    console.log(`  ${Math.min(i + CHUNK, targets.length)}/${targets.length} fixture · 누적 ${updated}행`);
    await new Promise((r) => setTimeout(r, 400)); // 운영 쿼리에 숨 쉴 틈
  }
  console.log(`갱신 ${updated}행 / 세부 스탯 없는 fixture ${emptyFixtures}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
