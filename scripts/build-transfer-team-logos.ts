// /transfers 피드(최신·빅딜) 팀마크 보강 사전 생성 → data/team-logos.json
//
// 피드의 fromTeamId/toTeamId(ts 팀)는 TeamSourceId→Team.logoUrl 로 71%만 커버(빅5 위주).
// 비빅5 출신팀(AIK·Cruzeiro 등)은 ts /team/additional/list?uuid= 단건 조회(인가 endpoint)로
// logo 를 수집해 정적 사전으로 보강. whitelisted IP 필요(이 맥북 OK, Vercel ❌) — 로컬 1회 실행.
//
//   npx tsx --env-file=.env.local scripts/build-transfer-team-logos.ts
//
// 멱등: 기존 json 을 읽어 누락분만 API 조회 후 merge. 신규 팀 등장 시 재실행.
import { PrismaClient } from "@prisma/client";
import { thesportsGet } from "../src/lib/sports/thesports/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const OUT = path.join(__dirname, "..", "data", "team-logos.json");
const FIVE = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];

async function main() {
  // 1) 피드 노출 범위(빅5·2026 여름창~)의 ts 팀 id 수집
  const rows = await prisma.footballTransfer.findMany({
    where: { league: { in: FIVE }, transferTime: { gte: Date.UTC(2026, 5, 1) / 1000 } },
    select: { fromTeamId: true, toTeamId: true },
  });
  const tsIds = [...new Set(rows.flatMap((r) => [r.fromTeamId, r.toTeamId]).filter(Boolean))] as string[];

  // 2) TeamSourceId→Team.logoUrl 로 이미 커버되는 팀 제외
  const mapped = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: tsIds } },
    select: { externalId: true, team: { select: { logoUrl: true } } },
  });
  const covered = new Set(mapped.filter((m) => m.team.logoUrl).map((m) => m.externalId));

  const existing: Record<string, string> = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  const todo = tsIds.filter((id) => !covered.has(id) && !existing[id]);
  console.log(`피드 ts팀 ${tsIds.length} / DB 커버 ${covered.size} / 기존 사전 ${Object.keys(existing).length} / 조회 대상 ${todo.length}`);

  // 3) ts team/additional/list 단건 조회로 logo 수집
  let ok = 0, miss = 0;
  for (const id of todo) {
    try {
      const res = await thesportsGet<{ code: number; results: Array<{ id: string; name?: string; logo?: string }> }>(
        "/v1/football/team/additional/list",
        { uuid: id },
      );
      const t = res.results?.[0];
      if (t?.logo) { existing[id] = t.logo; ok++; }
      else { miss++; console.log(`  (logo 없음) ${id} ${t?.name || ""}`); }
    } catch (e) {
      miss++;
      console.log(`  (조회 실패) ${id} — ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 350)); // rate limit 보호
  }

  fs.writeFileSync(OUT, JSON.stringify(existing));
  console.log(`수집 ${ok} / 실패·없음 ${miss} → ${OUT} (총 ${Object.keys(existing).length})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
