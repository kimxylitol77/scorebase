/**
 * INTL_FRIENDLY 매치 cross-league teamId 재매핑.
 *
 * 문제: 우리 DB 에 같은 국가대표가 INTL_FRIENDLY / WORLD_CUP 두 row 로 존재.
 *       (예: Morocco — id=599710 INTL_FRIENDLY vs id=3680 WORLD_CUP)
 *       INTL_FRIENDLY row 313개 100% ts mapping 누락 → /live 페이지 cache 못 채움.
 *
 * 해결: INTL_FRIENDLY 매치의 home/awayTeamId 를 같은 이름의 WORLD_CUP Team row 로
 *       update. WORLD_CUP row 가 없으면 그대로 유지 (Burundi 등 cup 본선 미진출).
 *       U18 / U23 / U20 / W (여자) 등 청소년/연령/성별 분리 row 는 절대 건드리지 않음.
 *
 * Usage:
 *   npx tsx scripts/remap_intl_friendly_teams.ts          # dry-run
 *   npx tsx scripts/remap_intl_friendly_teams.ts --apply  # 실제 적용
 */
import { prisma } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

// 청소년/연령/여자대표 등 분리 row 는 통합 금지 (이름에 이 토큰 들어가면 skip).
const SKIP_TOKENS = ["U18", "U17", "U16", "U19", "U20", "U21", "U22", "U23", "U24", " W", "Women"];

function shouldSkipMerge(name: string): boolean {
  return SKIP_TOKENS.some((t) => name.includes(t));
}

async function main() {
  // WORLD_CUP Team row (국가대표 본선 + 진출권 후보)
  const wcTeams = await prisma.team.findMany({
    where: { league: "WORLD_CUP" },
    select: { id: true, name: true },
  });
  const wcByName = new Map(wcTeams.map((t) => [t.name, t.id]));

  // INTL_FRIENDLY Team row
  const ifTeams = await prisma.team.findMany({
    where: { league: "INTL_FRIENDLY" },
    select: { id: true, name: true },
  });
  // (INTL_FRIENDLY id → WORLD_CUP id) 매핑 후보
  const remapTeamId = new Map<number, number>();
  let skippedNoMatch = 0;
  let skippedYouth = 0;
  for (const t of ifTeams) {
    if (shouldSkipMerge(t.name)) {
      skippedYouth += 1;
      continue;
    }
    const wcId = wcByName.get(t.name);
    if (wcId && wcId !== t.id) {
      remapTeamId.set(t.id, wcId);
    } else if (!wcId) {
      skippedNoMatch += 1;
    }
  }
  console.log(`INTL_FRIENDLY teams: ${ifTeams.length}`);
  console.log(`  통합 가능: ${remapTeamId.size}`);
  console.log(`  WORLD_CUP row 없음 (그대로 유지): ${skippedNoMatch}`);
  console.log(`  청소년/연령/여자 (그대로 유지): ${skippedYouth}`);

  // 매치 update 목록 — home/awayTeamId 중 remapTeamId 에 해당하는 것만
  const matches = await prisma.match.findMany({
    where: { league: "INTL_FRIENDLY" },
    select: { id: true, homeTeamId: true, awayTeamId: true },
  });
  const updates: Array<{ matchId: number; data: { homeTeamId?: number; awayTeamId?: number } }> = [];
  for (const m of matches) {
    const data: { homeTeamId?: number; awayTeamId?: number } = {};
    const h = remapTeamId.get(m.homeTeamId);
    const a = remapTeamId.get(m.awayTeamId);
    if (h) data.homeTeamId = h;
    if (a) data.awayTeamId = a;
    if (Object.keys(data).length > 0) updates.push({ matchId: m.id, data });
  }
  console.log(`\n매치 update 필요: ${updates.length} / ${matches.length}`);

  console.log("\n--- 통합 sample (최대 15) ---");
  const sampleRemap = Array.from(remapTeamId.entries()).slice(0, 15);
  const ifById = new Map(ifTeams.map((t) => [t.id, t.name]));
  for (const [ifId, wcId] of sampleRemap) {
    console.log(`  ${ifId}(IF "${ifById.get(ifId)}") → ${wcId}(WC)`);
  }

  if (!APPLY) {
    console.log("\n--- update sample (최대 10) ---");
    for (const u of updates.slice(0, 10)) console.log(`  match=${u.matchId}`, u.data);
    console.log("\n--apply 붙여서 실제 적용.");
    return;
  }

  console.log("\n--- APPLY 진행 ---");
  let done = 0;
  for (const u of updates) {
    await prisma.match.update({ where: { id: u.matchId }, data: u.data });
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`\n완료: ${done} 매치 update.`);
  console.log("\n주의: INTL_FRIENDLY Team row 자체는 삭제하지 않음 (Article 등 FK 살아있을 수 있음).");
  console.log("      이후 매치는 모두 WORLD_CUP Team row 를 가리키므로 ts mapping 으로 cache 채워짐.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
