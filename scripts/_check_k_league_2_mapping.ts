import { readFileSync } from "fs";
import path from "path";
import { prisma } from "../src/lib/db";

interface JsonEntry {
  ourId: number;
  ourName: string;
  ourLeague: string;
  ourExternalId: string;
  tsId: string;
  tsName?: string;
  matchType?: string;
}

async function main() {
  const teams = await prisma.team.findMany({
    where: { league: "K_LEAGUE_2" },
    select: { id: true, name: true, externalId: true },
    orderBy: { name: "asc" },
  });
  const tsi = await prisma.teamSourceId.findMany({
    where: { league: "K_LEAGUE_2", source: "thesports" },
    select: { teamId: true, externalId: true },
  });
  console.log(`Team rows (K_LEAGUE_2): ${teams.length}`);
  console.log(`TeamSourceId (thesports, K_LEAGUE_2): ${tsi.length}`);
  const tsiByTeam = new Map(tsi.map((r) => [r.teamId, r.externalId]));

  const file = path.join(process.cwd(), "src/lib/sports/thesports/team-id-mapping.json");
  const arr: JsonEntry[] = JSON.parse(readFileSync(file, "utf-8"));
  const jsonByOurId = new Map(arr.filter((e) => e.ourLeague === "K_LEAGUE_2").map((e) => [e.ourId, e]));
  const jsonByTsId = new Map(arr.filter((e) => e.ourLeague === "K_LEAGUE_2").map((e) => [e.tsId, e]));
  console.log(`JSON entries (K_LEAGUE_2): ${jsonByOurId.size}`);

  console.log("\n# K_LEAGUE_2 팀별 매핑 현황");
  for (const t of teams) {
    const tsiId = tsiByTeam.get(t.id);
    const jsonEntry = jsonByOurId.get(t.id);
    const tsId = tsiId ?? jsonEntry?.tsId ?? null;
    const src = tsiId ? "DB" : jsonEntry ? "JSON" : "MISSING";
    console.log(
      `  ${String(t.id).padStart(6)}  ${(t.name + "                              ").slice(0, 30)}  ext=${(t.externalId + "      ").slice(0,6)}  tsId=${tsId ?? "(none)"} [${src}]`,
    );
  }

  console.log("\n# JSON 의 K_LEAGUE_2 entry 중 DB Team 부재 (orphan ourId):");
  const teamIds = new Set(teams.map((t) => t.id));
  for (const e of jsonByOurId.values()) {
    if (!teamIds.has(e.ourId)) {
      console.log(`  ourId=${e.ourId} ${e.ourName} tsId=${e.tsId} (DB Team row 없음)`);
    }
  }

  console.log("\n# 88120 / 88123 매치 확인");
  for (const id of [88120, 88123]) {
    const m = await prisma.match.findUnique({
      where: { id },
      include: {
        homeTeam: { select: { id: true, name: true, league: true } },
        awayTeam: { select: { id: true, name: true, league: true } },
      },
    });
    if (!m) { console.log(`  ${id}: NOT FOUND`); continue; }
    const cache = await prisma.theSportsMatchCache.findUnique({ where: { matchId: m.id }, select: { tsMatchId: true } });
    console.log(
      `  ${m.id} league=${m.league} ext=${m.externalId}  ${m.homeTeam.name}(team=${m.homeTeam.id}/L=${m.homeTeam.league}) vs ${m.awayTeam.name}(team=${m.awayTeam.id}/L=${m.awayTeam.league})  start=${m.startTime.toISOString()} status=${m.status} tsMatchId=${cache?.tsMatchId ?? "null"}`,
    );
  }

  console.log("\n# JSON K_LEAGUE_2 tsId 가 다른 league 매치(home_team_id) 로 등장하는지 cross-check:");
  for (const e of jsonByTsId.values()) {
    const wrong = await prisma.teamSourceId.findFirst({
      where: { source: "thesports", externalId: e.tsId, NOT: { league: "K_LEAGUE_2" } },
      select: { league: true, teamId: true },
    });
    if (wrong) console.log(`  tsId=${e.tsId} (${e.ourName}) 가 ${wrong.league} TeamSourceId(team=${wrong.teamId}) 로 매핑 — JSON 충돌 가능성`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => (prisma as any).$disconnect());
