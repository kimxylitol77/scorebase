// 월드컵 48개국 공식 스쿼드 수집 — TheSports team/squad/list → data/wc-national-squads.json
// { ourTeamId: { name, tsId, updatedAt, squad: [{ id, name, position(G|D|M|F), number }] } }
//
// 용도: 월드컵 국가별 선수 몸값 페이지(스쿼드 명단 ← 여기, 몸값 ← PlayerMarketValue 조인).
// whitelisted IP 필요(맥북 OK). 멱등 — 재실행 시 전체 갱신. 소집 명단 발표·교체 후 재실행.
//   npx tsx --env-file=.env.local scripts/build-wc-national-squads.ts
import { PrismaClient } from "@prisma/client";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "wc-national-squads.json");

interface SquadResp {
  code: number;
  results?: Array<{ squad?: Array<{ player?: { id?: string; name?: string }; position?: string; shirt_number?: number }> }>;
}

async function main() {
  const matches = await prisma.match.findMany({
    where: { league: "WORLD_CUP" },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const [srcs, teams] = await Promise.all([
    prisma.teamSourceId.findMany({
      where: { teamId: { in: teamIds }, source: "thesports" },
      select: { teamId: true, externalId: true },
    }),
    prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
  ]);
  const tsOf = new Map(srcs.map((s) => [s.teamId, s.externalId]));
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  console.log(`월드컵 ${teamIds.length}개국 · ts id ${tsOf.size}개`);

  const out: Record<string, { name: string; tsId: string; updatedAt: string; squad: Array<{ id: string; name: string; position: string | null; number: number | null }> }> = {};
  let ok = 0, empty = 0;
  for (const teamId of teamIds) {
    const tsId = tsOf.get(teamId);
    if (!tsId) continue;
    try {
      const res = await thesportsGet<SquadResp>("/v1/football/team/squad/list", { uuid: tsId });
      const squad = (res.results?.[0]?.squad ?? [])
        .filter((s) => s.player?.id && s.player?.name)
        .map((s) => ({
          id: s.player!.id!,
          name: s.player!.name!,
          position: s.position || null,
          number: typeof s.shirt_number === "number" ? s.shirt_number : null,
        }));
      if (squad.length) {
        out[String(teamId)] = { name: nameOf.get(teamId) ?? "", tsId, updatedAt: new Date().toISOString().slice(0, 10), squad };
        ok++;
        console.log(`  ✓ ${nameOf.get(teamId)?.padEnd(22)} ${squad.length}명`);
      } else { empty++; console.log(`  · ${nameOf.get(teamId)} 빈 응답`); }
    } catch (e) {
      empty++;
      console.log(`  ✗ ${nameOf.get(teamId)} ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  const totalPlayers = Object.values(out).reduce((a, t) => a + t.squad.length, 0);
  console.log(`\n✓ wrote wc-national-squads.json — ${ok}개국(빈 ${empty}) · 선수 ${totalPlayers}명`);

  // PMV 커버 측정 (공식 스쿼드 기준)
  const allIds = Object.values(out).flatMap((t) => t.squad.map((s) => s.id));
  const mv = await prisma.playerMarketValue.findMany({ where: { id: { in: allIds } }, select: { id: true, currentValue: true } });
  console.log(`PMV 커버 ${mv.length}/${allIds.length} (${((mv.length / allIds.length) * 100).toFixed(0)}%)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
