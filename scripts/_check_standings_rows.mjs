import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const row = await p.theSportsStandingsCache.findUnique({ where: { league: "LIGUE_1" }, select: { payload: true } });
const tables = row?.payload?.tables ?? [];
console.log("table count:", tables.length);
if (tables[0]?.rows?.length) {
  console.log("row[0] keys:", Object.keys(tables[0].rows[0]));
  console.log("row[0]:", JSON.stringify(tables[0].rows[0], null, 2).slice(0, 500));
  console.log("sample rows:");
  for (const r of tables[0].rows.slice(0, 4)) {
    console.log(`  pos=${r.position} team_id=${r.team_id} name=${r.team_name ?? r.team?.name ?? "?"}`);
  }
}
await p.$disconnect();
