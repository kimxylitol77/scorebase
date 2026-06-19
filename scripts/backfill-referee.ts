// 기존 축구 매치의 raw 를 파싱해 Match.referee 를 백필한다.
// af 소스(fixture.referee) · football-data EPL(referees[]) 만 raw 에서 추출 가능.
// ESPN 6리그(라리가·분데스 등)는 raw 에 referee 가 없어 fetch-api-football Phase 3 가 보강.
// 안전: referee=null 인 매치만 대상, 추출 성공 시에만 update (기존값 미손상).
import { prisma } from "../src/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */
function extractReferee(raw: any): string | null {
  // api-football: fixture.referee (이름 문자열)
  const af = raw?.fixture?.referee;
  if (typeof af === "string" && af.trim()) return af.trim();
  // football-data (EPL): referees[] — type "REFEREE" 가 주심
  const refs = raw?.referees;
  if (Array.isArray(refs) && refs.length > 0) {
    const main = refs.find((x: any) => x?.type === "REFEREE") ?? refs[0];
    if (typeof main?.name === "string" && main.name.trim()) return main.name.trim();
  }
  return null;
}

async function main() {
  const BATCH = 1000;
  let cursor = 0;
  let scanned = 0;
  let updated = 0;
  const byLeague: Record<string, number> = {};

  for (;;) {
    const rows = await prisma.match.findMany({
      where: { referee: null, raw: { not: null }, id: { gt: cursor } },
      select: { id: true, raw: true, league: true },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (rows.length === 0) break;

    for (const m of rows) {
      cursor = m.id;
      scanned++;
      let raw: any;
      try {
        raw = JSON.parse(m.raw!);
      } catch {
        continue;
      }
      const ref = extractReferee(raw);
      if (ref) {
        await prisma.match.update({
          where: { id: m.id },
          data: { referee: ref },
        });
        updated++;
        byLeague[m.league] = (byLeague[m.league] ?? 0) + 1;
      }
    }
    console.log(`... 스캔 ${scanned}, 백필 ${updated} (cursor ${cursor})`);
  }

  console.log(`\n완료 — ${scanned} 매치 스캔, ${updated} 건 주심 백필`);
  console.log(
    "리그별: " +
      Object.entries(byLeague)
        .sort((a, b) => b[1] - a[1])
        .map(([l, n]) => `${l}:${n}`)
        .join("  "),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
