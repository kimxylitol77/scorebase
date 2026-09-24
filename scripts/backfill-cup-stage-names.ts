// 토너먼트 경기 raw 에 ts 라운드 이름(stageName)을 백필 — ts 수집기 경로로 들어온 경기만.
//
// ts 수집기(football-collector)는 경기 객체를 raw 에 그대로 넣는데 round 엔 stage_id 만 있고 이름이 없다.
// 2026-09-24 부터 수집기가 토너먼트 경기에 이름을 붙이지만, 그 전에 쌓인 경기는 이 스크립트로 한 번 채운다.
// ts 경기 객체 형태({"round":{"stage_id":…}})만 건드린다 — af 원본·워커 {"thesports":…} 는 그대로 둔다.
//
//   npx tsx scripts/backfill-cup-stage-names.ts [--league=FA_CUP] [--dry]
import "@/lib/env";
import { prisma } from "@/lib/db";
import { STAGED_COMPETITIONS } from "@/lib/sports/season-calendar";
import { tsStageName } from "@/lib/sports/thesports/stage-names";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const DRY = process.argv.includes("--dry");

async function main() {
  const leagues = arg("league") ? [arg("league")!] : [...STAGED_COMPETITIONS];
  let scanned = 0, updated = 0, unnamed = 0;
  for (const league of leagues) {
    const rows = await prisma.match.findMany({ where: { league, raw: { contains: '"stage_id"' } }, select: { id: true, raw: true } });
    const todo: { id: number; raw: string }[] = [];
    for (const r of rows) {
      scanned++;
      let j: { thesports?: unknown; league?: unknown; round?: { stage_id?: string; stageName?: string | null } };
      try { j = JSON.parse(r.raw ?? ""); } catch { continue; }
      if (j.thesports || j.league || !j.round?.stage_id || j.round.stageName) continue;
      const name = await tsStageName(j.round.stage_id);
      if (!name) { unnamed++; continue; }
      j.round.stageName = name;
      todo.push({ id: r.id, raw: JSON.stringify(j) });
    }
    if (todo.length) console.log(`${league}: ${todo.length}경기 채움${DRY ? " (dry)" : ""}`);
    if (!DRY) {
      for (let i = 0; i < todo.length; i += 50) {
        await prisma.$transaction(todo.slice(i, i + 50).map((t) => prisma.match.update({ where: { id: t.id }, data: { raw: t.raw } })));
      }
    }
    updated += todo.length;
  }
  console.log(`훑음 ${scanned} · 채움 ${updated} · 이름 못 구함 ${unnamed}${DRY ? " · dry" : ""}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
