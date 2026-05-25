import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";

interface JsonEntry {
  ourId: number;
  ourName: string;
  ourLeague: string;
  ourExternalId: string;
  tsId: string;
  tsName?: string;
  tsKo?: string;
  matchType?: string;
  tsVenueId?: string;
}

const MAPPINGS: Array<{ teamId: number; tsId: string; tsName: string; note: string }> = [
  { teamId: 111529, tsId: "y0or5jhlodoqwzv", tsName: "Paju Frontier FC", note: "missing — JSON had it" },
  { teamId: 175600, tsId: "v2y8m4zhdy2ql07", tsName: "Suwon Samsung Bluewings", note: "missing — JSON had it" },
  { teamId: 111525, tsId: "x7lm7phk7d8m2wd", tsName: "Chungbuk Cheongju FC", note: "missing — new entry" },
  { teamId: 111527, tsId: "6ypq3nh50o2md7o", tsName: "Gimpo FC", note: "stale — adds new tsId" },
  { teamId: 116473, tsId: "23xmvkh3yopqg8n", tsName: "Suwon Football Club", note: "stale — adds new tsId" },
  { teamId: 111523, tsId: "965mkyhzwgwr1ge", tsName: "Yongin FC", note: "stale — adds new tsId" },
];

const JSON_PATH = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");

async function main() {
  const apply = process.argv.includes("--apply");
  const label = apply ? "APPLY" : "DRY-RUN";
  console.log(`[${label}] K_LEAGUE_2 ts mapping sync — ${MAPPINGS.length} rows`);

  const teams = await prisma.team.findMany({
    where: { id: { in: MAPPINGS.map((m) => m.teamId) } },
    select: { id: true, name: true, league: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));
  for (const m of MAPPINGS) {
    const t = teamById.get(m.teamId);
    if (!t) { console.error(`  ✗ team ${m.teamId} 없음 — abort`); process.exit(1); }
    if (t.league !== "K_LEAGUE_2") { console.error(`  ✗ team ${m.teamId} league=${t.league} (K_LEAGUE_2 아님) — abort`); process.exit(1); }
    console.log(`  ${m.teamId}  ${t.name}  → tsId=${m.tsId}  (${m.note})`);
  }

  const existing = await prisma.teamSourceId.findMany({
    where: { league: "K_LEAGUE_2", source: "thesports", externalId: { in: MAPPINGS.map((m) => m.tsId) } },
    select: { teamId: true, externalId: true },
  });
  if (existing.length > 0) {
    console.log("\n# Already in DB (will skip):");
    for (const e of existing) console.log(`  team=${e.teamId}  tsId=${e.externalId}`);
  }
  const skip = new Set(existing.map((e) => `${e.teamId}|${e.externalId}`));
  const toInsert = MAPPINGS.filter((m) => !skip.has(`${m.teamId}|${m.tsId}`));
  console.log(`\nDB INSERT (after skip): ${toInsert.length} rows`);

  if (apply && toInsert.length > 0) {
    const r = await prisma.teamSourceId.createMany({
      data: toInsert.map((m) => ({ league: "K_LEAGUE_2", source: "thesports", externalId: m.tsId, teamId: m.teamId })),
      skipDuplicates: true,
    });
    console.log(`  ✅ TeamSourceId createMany: ${r.count} inserted`);
  }

  const arr: JsonEntry[] = JSON.parse(readFileSync(JSON_PATH, "utf-8"));
  const existsByTsId = new Set(arr.map((e) => e.tsId));
  const jsonAdd: JsonEntry[] = [];
  for (const m of MAPPINGS) {
    if (existsByTsId.has(m.tsId)) continue;
    const t = teamById.get(m.teamId)!;
    jsonAdd.push({
      ourId: m.teamId,
      ourName: t.name,
      ourLeague: "K_LEAGUE_2",
      ourExternalId: "",
      tsId: m.tsId,
      tsName: m.tsName,
      matchType: "manual",
    });
  }
  console.log(`\nJSON 추가 (team-id-mapping.json): ${jsonAdd.length} entries`);
  for (const e of jsonAdd) console.log(`  + ourId=${e.ourId}  ${e.ourName}  tsId=${e.tsId}`);

  if (apply && jsonAdd.length > 0) {
    const team = await prisma.team.findMany({
      where: { id: { in: jsonAdd.map((e) => e.ourId) } },
      select: { id: true, externalId: true },
    });
    const extById = new Map(team.map((t) => [t.id, t.externalId]));
    for (const e of jsonAdd) e.ourExternalId = extById.get(e.ourId) ?? "";
    const merged = [...arr, ...jsonAdd];
    writeFileSync(JSON_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log(`  ✅ JSON written: ${merged.length} total entries (+${jsonAdd.length})`);
  }

  if (!apply) console.log("\n(dry-run — `--apply` 로 실제 적용)");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect());
