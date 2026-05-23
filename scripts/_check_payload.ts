import { prisma } from "../src/lib/db";
async function main() {
  const c = await prisma.theSportsStandingsCache.findUnique({ where: { league: "LALIGA" } });
  if (!c) return console.log("NO");
  const p = c.payload as any;
  console.log("payload keys:", Object.keys(p));
  if (p.tables) {
    console.log("tables 길이:", Array.isArray(p.tables) ? p.tables.length : "not array");
    if (Array.isArray(p.tables) && p.tables[0]) {
      console.log("table[0] keys:", Object.keys(p.tables[0]));
      console.log("rows 길이:", Array.isArray(p.tables[0].rows) ? p.tables[0].rows.length : "?");
      if (Array.isArray(p.tables[0].rows) && p.tables[0].rows[0]) {
        console.log("row[0]:", JSON.stringify(p.tables[0].rows[0]).slice(0,300));
      }
    }
  }
  // EPL 비교
  const ep = await prisma.theSportsStandingsCache.findUnique({ where: { league: "EPL" } });
  if (ep) {
    const pe = ep.payload as any;
    console.log("\nEPL payload keys:", Object.keys(pe));
    if (pe.tables && Array.isArray(pe.tables) && pe.tables[0] && Array.isArray(pe.tables[0].rows)) {
      console.log("EPL row[0]:", JSON.stringify(pe.tables[0].rows[0]).slice(0,300));
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
