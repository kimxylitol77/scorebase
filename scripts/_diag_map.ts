import { prisma } from "../src/lib/db";
import mapping from "../src/lib/sports/thesports/team-id-mapping.json";

async function main() {
  for (const league of ["LALIGA", "EPL", "SERIE_A"]) {
    const ts = await prisma.theSportsStandingsCache.findUnique({ where: { league } });
    if (!ts) continue;
    const p = ts.payload as any;
    const standingsTeamIds = new Set<string>();
    for (const t of p.tables ?? []) {
      for (const r of t.rows ?? []) if (r.team_id) standingsTeamIds.add(r.team_id);
    }
    const mappedTsIds = new Set((mapping as any[]).filter(m => m.ourLeague === league).map(m => m.tsId));
    const overlap = [...standingsTeamIds].filter(x => mappedTsIds.has(x));
    console.log(`${league}: standings team_ids=${standingsTeamIds.size}, mapping tsIds=${mappedTsIds.size}, overlap=${overlap.length}`);
    if (overlap.length < 5) {
      console.log(`  standings sample: ${[...standingsTeamIds].slice(0,3).join(', ')}`);
      console.log(`  mapping sample:   ${[...mappedTsIds].slice(0,3).join(', ')}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
