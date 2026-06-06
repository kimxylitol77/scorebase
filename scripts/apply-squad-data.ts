// /tmp/squad-big.json (worker 스쿼드 수집본) → TheSportsPlayer.position 보강 + 영문명 복구율 측정.
// 영문명 자체는 Wikidata 보강(enrich-players-wikidata)에서 이 JSON 을 직접 읽어 쓴다(DB 저장 안 함).
//   npx tsx --env-file=.env.local scripts/apply-squad-data.ts
import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
const prisma = new PrismaClient();

interface SquadRow { id: string; name: string | null; position: string | null; teamId: string; league: string }

async function main() {
  const rows: SquadRow[] = JSON.parse(fs.readFileSync("/tmp/squad-big.json", "utf8"));
  console.log("스쿼드 수집:", rows.length);

  // position 보강 (G/D/M/F) — squad 가 라인업보다 커버리지 넓음
  const posMap = new Map<string, string>();
  for (const r of rows) if (r.id && r.position && ["G", "D", "M", "F"].includes(r.position)) posMap.set(r.id, r.position);
  const groups: Record<string, string[]> = { G: [], D: [], M: [], F: [] };
  for (const [id, pos] of posMap) groups[pos].push(id);
  let updated = 0;
  for (const [pos, ids] of Object.entries(groups)) {
    for (let i = 0; i < ids.length; i += 5000) {
      const r = await prisma.theSportsPlayer.updateMany({
        where: { id: { in: ids.slice(i, i + 5000) }, sport: "FOOTBALL" },
        data: { position: pos },
      });
      updated += r.count;
    }
  }
  console.log("position 적용:", updated);

  // 영문명 복구율 — 5대리그 몸값선수 기준
  const enMap = new Map<string, string>();
  for (const r of rows) if (r.id && r.name && /[A-Za-z]/.test(r.name)) enMap.set(r.id, r.name);
  const mvIds = (await prisma.playerMarketValue.findMany({
    where: { league: { in: ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] }, currentValue: { not: null } },
    select: { id: true },
  })).map((r) => r.id);
  const tsp = await prisma.theSportsPlayer.findMany({ where: { id: { in: mvIds } }, select: { id: true, name: true } });
  const tsEnglish = new Set(tsp.filter((p) => /^[A-Za-z]/.test(p.name)).map((p) => p.id));

  let haveEn = 0;
  for (const id of mvIds) if (enMap.has(id) || tsEnglish.has(id)) haveEn++;
  console.log(`\n5대리그 몸값선수 ${mvIds.length}명 중 영문명 확보: ${haveEn} (${Math.round(haveEn / mvIds.length * 100)}%)`);
  console.log(`  (squad 영문명 ${enMap.size}, ts.name 영문 ${tsEnglish.size})`);

  // 5대리그 중 position 보유율
  const withPos = await prisma.theSportsPlayer.count({ where: { id: { in: mvIds }, position: { not: null } } });
  console.log(`5대리그 position 보유: ${withPos} (${Math.round(withPos / mvIds.length * 100)}%)`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
