// 선수 시즌통계 아카이브 잡 — 스냅샷 JSON 2종(ts·af)을 매일 (source, playerId, seasonLabel) 로
// 굳힌다. 주간 리빌드가 시즌을 넘기면 라벨이 바뀌어 이전 시즌 행이 자연 동결된다.
// 가드: 같은 라벨인데 경기 수가 줄면 덮지 않음 (부분 리빌드로 최종 스탯 훼손 방지).
// 위키형 데이터 축적 (선수 축). 17k 행 규모라 리그 단위 배치(createMany + 조건 update)로 처리.
import "@/lib/env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import rawTsStats from "../../data/player-season-stats.json";
import rawAfStats from "../../data/af-player-season-stats.json";

interface StatEntry {
  lg?: string;
  season?: string;
  matches?: number | null;
  [k: string]: unknown;
}

async function archiveSource(
  source: "ts" | "af",
  data: Record<string, StatEntry>,
  out: Record<string, number>,
) {
  const entries = Object.entries(data).filter(([, v]) => v?.lg && v?.season);
  // (playerId, label) 후보 → 기존 행 일괄 조회 후 create/update 분리
  const keys = entries.map(([id, v]) => ({ playerId: id, seasonLabel: v.season! }));
  const existing = await prisma.playerSeasonStatArchive.findMany({
    where: { source, seasonLabel: { in: [...new Set(keys.map((k) => k.seasonLabel))] } },
    select: { playerId: true, seasonLabel: true, stat: true },
  });
  const prevMatches = new Map(
    existing.map((e) => [
      `${e.playerId}|${e.seasonLabel}`,
      ((e.stat as unknown as StatEntry)?.matches as number | null) ?? 0,
    ]),
  );

  const creates: Prisma.PlayerSeasonStatArchiveCreateManyInput[] = [];
  const updates: { playerId: string; seasonLabel: string; entry: StatEntry }[] = [];
  for (const [id, v] of entries) {
    const key = `${id}|${v.season}`;
    if (!prevMatches.has(key)) {
      creates.push({
        source,
        playerId: id,
        league: v.lg!,
        seasonLabel: v.season!,
        stat: v as unknown as Prisma.InputJsonValue,
      });
    } else if ((prevMatches.get(key) ?? 0) <= (v.matches ?? 0)) {
      updates.push({ playerId: id, seasonLabel: v.season!, entry: v });
    } else {
      out[`${source}-regress`] = (out[`${source}-regress`] ?? 0) + 1;
    }
  }
  for (let i = 0; i < creates.length; i += 1000) {
    await prisma.playerSeasonStatArchive.createMany({
      data: creates.slice(i, i + 1000),
      skipDuplicates: true,
    });
  }
  for (let i = 0; i < updates.length; i += 20) {
    await Promise.all(
      updates.slice(i, i + 20).map((u) =>
        prisma.playerSeasonStatArchive.update({
          where: {
            source_playerId_seasonLabel: {
              source,
              playerId: u.playerId,
              seasonLabel: u.seasonLabel,
            },
          },
          data: {
            league: u.entry.lg!,
            stat: u.entry as unknown as Prisma.InputJsonValue,
            updatedAt: new Date(),
          },
        }),
      ),
    );
  }
  out[`${source}-created`] = (out[`${source}-created`] ?? 0) + creates.length;
  out[`${source}-updated`] = (out[`${source}-updated`] ?? 0) + updates.length;
}

export async function runArchivePlayerStats() {
  const out: Record<string, number> = {};
  await archiveSource("ts", rawTsStats as Record<string, StatEntry>, out);
  await archiveSource("af", rawAfStats as Record<string, StatEntry>, out);
  out.total = await prisma.playerSeasonStatArchive.count();
  return out;
}

// 직접 실행 (npx tsx --env-file=.env.local src/jobs/archive-player-stats.ts)
if (import.meta.url === `file://${process.argv[1]}`) {
  runArchivePlayerStats()
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
