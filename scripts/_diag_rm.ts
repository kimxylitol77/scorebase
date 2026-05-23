import { prisma } from "../src/lib/db";
import mapping from "../src/lib/sports/thesports/team-id-mapping.json";
import { getStandingsPositions } from "../src/lib/sports/thesports/standings-helper";

async function main() {
  // 매핑에서 Real Madrid LALIGA tsId
  const rm = (mapping as any[]).find(m => m.ourName === "Real Madrid" && m.ourLeague === "LALIGA");
  console.log("매핑 Real Madrid LALIGA:", { ourId: rm?.ourId, tsId: rm?.tsId });

  // standings cache 의 Real Madrid (position 1)
  const ts = await prisma.theSportsStandingsCache.findUnique({ where: { league: "LALIGA" } });
  const p = ts!.payload as any;
  const top3 = (p.tables[0].rows as any[]).slice(0,3).map(r => ({ team_id: r.team_id, position: r.position, points: r.points }));
  console.log("standings top 3:", top3);

  // getStandingsPositions 호출 결과
  const pos = await getStandingsPositions("LALIGA");
  console.log("\ngetStandingsPositions size:", pos?.size);
  if (pos) {
    console.log("Real Madrid (id=1) position:", pos.get(1));
    console.log("first 5 entries:", [...pos.entries()].slice(0,5));
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
