// 과거 매치 venueId 소급 백필 — ts /v1/football/match/season/recent (리그·시즌당 1콜).
// 신규 매치는 수집기가 8월 초부터 직접 채우지만(실측 30건), 과거분은 raw 부재로 소급 불가였다.
// 시즌 매치 목록의 venue_id 를 우리 Match.externalId("ts-{id}") 에 이어붙인다. 위키 축적 (구장 축).
//
//   npx tsx --env-file=.env.local scripts/backfill-match-venues-ts.ts          # dry
//   npx tsx --env-file=.env.local scripts/backfill-match-venues-ts.ts --write
//
// 시즌 uuid = 순위 캐시(현재) + legacy 맵(직전) — 리그당 최대 2콜. venueId null 인 행만 채운다(멱등).

import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import { SOCCER_LEAGUES } from "../src/lib/sports/sport-leagues";
import { legacyTsSeasonId } from "../src/lib/sports/season-registry";

const WRITE = process.argv.includes("--write");

async function main() {
  const soccer = SOCCER_LEAGUES as ReadonlySet<string>;
  const caches = await prisma.theSportsStandingsCache.findMany({ select: { league: true, tsSeasonId: true } });
  const uuids = new Set<string>();
  for (const c of caches) {
    if (!soccer.has(c.league)) continue;
    if (c.tsSeasonId) uuids.add(c.tsSeasonId);
    const legacy = legacyTsSeasonId(c.league);
    if (legacy) uuids.add(legacy);
  }
  console.log(`시즌 uuid ${uuids.size}개 조회 시작`);

  const pairs = new Map<string, string>(); // ts match id → venue_id
  let fetched = 0, failed = 0;
  for (const uuid of uuids) {
    try {
      const d = await thesportsGet<{ code: number; results?: Array<{ id?: string; venue_id?: string }> }>(
        "/v1/football/match/season/recent",
        { uuid },
      );
      for (const r of d.results ?? []) {
        if (r.id && r.venue_id) pairs.set(r.id, r.venue_id);
      }
      fetched++;
      await new Promise((r) => setTimeout(r, 150));
    } catch {
      failed++;
    }
  }
  console.log(`시즌 ${fetched}개 성공 · ${failed}개 실패 · venue 보유 매치 ${pairs.size}건`);

  // 우리 매치 중 venueId 비어 있는 대상만
  const targets = await prisma.match.findMany({
    where: { venueId: null, externalId: { in: [...pairs.keys()].map((id) => `ts-${id}`) } },
    select: { id: true, externalId: true },
  });
  console.log(`채울 우리 매치: ${targets.length}건${WRITE ? "" : " (dry — --write 로 기록)"}`);
  if (!WRITE || targets.length === 0) return;

  // VALUES 배치 업데이트 — 수만 건을 개별 update 로 돌리면 분 단위로 밀린다
  let updated = 0;
  for (let i = 0; i < targets.length; i += 500) {
    const chunk = targets.slice(i, i + 500);
    const values = Prisma.join(
      chunk.map((t) => Prisma.sql`(${t.id}, ${pairs.get(t.externalId!.slice(3))!})`),
    );
    const n = await prisma.$executeRaw`
      UPDATE "Match" AS m SET "venueId" = v.vid
      FROM (VALUES ${values}) AS v(id, vid)
      WHERE m.id = v.id AND m."venueId" IS NULL
    `;
    updated += n;
  }
  console.log(`기록 완료: ${updated}건`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
