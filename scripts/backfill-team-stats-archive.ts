// 팀 시즌 통계 아카이브 백필 — data/team-season-stats.json (2026-06 빌드, 빅4 리그 76팀
// 25-26 풀시즌 동결분) 을 TeamSeasonStatArchive 에 label "2025-26" 으로 소급 굳히기.
// JSON 키 = ts team id → TeamSourceId 로 우리 Team.id 해석. 멱등(이미 있으면 skip).
//
//   npx tsx --env-file=.env.local scripts/backfill-team-stats-archive.ts

import fs from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { upsertTeamStat, type ArchivedTeamStat } from "../src/jobs/archive-team-stats";

const SRC = path.join(__dirname, "..", "data", "team-season-stats.json");
const LABEL = "2025-26"; // JSON 은 빅4 유럽 리그 25-26 풀시즌(38/34경기) 동결분 — 실측 확인

async function main() {
  const raw = JSON.parse(fs.readFileSync(SRC, "utf-8")) as Record<string, ArchivedTeamStat>;
  const tsIds = Object.keys(raw);
  const srcRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsIds } },
    select: { externalId: true, teamId: true, team: { select: { league: true } } },
  });
  const byTs = new Map(srcRows.map((s) => [s.externalId, s]));

  const out = { saved: 0, exists: 0, unmapped: [] as string[] };
  for (const [tsId, stat] of Object.entries(raw)) {
    const hit = byTs.get(tsId);
    if (!hit) {
      out.unmapped.push(`${stat.name}(${stat.lg})`);
      continue;
    }
    const existing = await prisma.teamSeasonStatArchive.findUnique({
      where: { teamId_seasonLabel: { teamId: hit.teamId, seasonLabel: LABEL } },
      select: { id: true },
    });
    if (existing) {
      out.exists++;
      continue;
    }
    await upsertTeamStat(hit.teamId, stat.lg, LABEL, stat);
    out.saved++;
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
