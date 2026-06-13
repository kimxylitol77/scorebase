// 국가대표 스쿼드(data/wc-national-squads.json) 선수의 뒤집힌 한글명(이름 성 → 성이름) 일회성 교정.
// 영문명으로 국적 판별 + 일본 함정 가드는 src/lib/korean-name-order 의 deReverseKoreanName 에 위임 (봇과 동일 로직).
//   dry-run: npx tsx --env-file=.env.local scripts/fix-squad-nameko-order.ts
//   apply:   ... --apply
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { deReverseKoreanName } from "../src/lib/korean-name-order";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Squad = { name: string; tsId: string; squad: Array<{ id: string; name: string }> };

async function main() {
  const data = JSON.parse(readFileSync("data/wc-national-squads.json", "utf8")) as Record<string, Squad>;
  const idToCountry = new Map<string, string>();
  for (const entry of Object.values(data)) {
    for (const p of entry.squad) if (!idToCountry.has(p.id)) idToCountry.set(p.id, entry.name);
  }
  const allIds = [...idToCountry.keys()];

  const players = await prisma.theSportsPlayer.findMany({
    where: { id: { in: allIds } },
    select: { id: true, name: true, nameKo: true },
  });
  console.log(`스쿼드 고유 id=${allIds.length}, DB 매칭=${players.length}`);

  const targets: Array<{ id: string; country: string; name: string; from: string; to: string }> = [];
  for (const p of players) {
    if (!p.nameKo) continue;
    const fixed = deReverseKoreanName(p.nameKo, p.name);
    if (fixed !== p.nameKo) {
      targets.push({ id: p.id, country: idToCountry.get(p.id)!, name: p.name, from: p.nameKo, to: fixed });
    }
  }

  console.log(`\n교정 대상=${targets.length}`);
  for (const t of targets) {
    console.log(`  [${t.country}] ${t.name.padEnd(20)} | "${t.from}" → "${t.to}" | ${t.id}`);
  }

  if (!APPLY) { console.log("\n[DRY-RUN] --apply 로 적용"); await prisma.$disconnect(); return; }

  let done = 0;
  for (const t of targets) {
    await prisma.theSportsPlayer.update({ where: { id: t.id }, data: { nameKo: t.to } });
    done++;
  }
  console.log(`\n적용 완료: ${done}건`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
