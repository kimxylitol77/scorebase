// TeamSourceId 이름 매칭 오염 수리 (dry-run 기본).
// 하나의 thesports ts id 가 서로 다른 실제 클럽의 Team row 에 연결된 오염 row 를 제거한다.
// 각 row 는 (source, externalId, teamId) 튜플로 검증 후에만 삭제 — 데이터가 어긋나면 중단.
//
// 사용:
//   node --env-file=.env.local scripts/fix-teamsourceid-contamination.mjs           # dry-run
//   node --env-file=.env.local scripts/fix-teamsourceid-contamination.mjs --apply    # 실제 삭제

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

// 삭제 대상. reason 은 근거(주인 검증 결과).
const DELETE_ROWS = [
  // [A] 축구 이름매칭 오염 — ts id 는 유럽 클럽 것인데 남미 동명 클럽 row 에 잘못 연결
  {
    id: 962, source: "thesports", externalId: "e4wyrn4h127q86p", teamId: 119247,
    reason: "e4wyrn4h127q86p=FC 바르셀로나(스쿼드 ter Stegen/Yamal 확인). teamId 119247=에콰도르 Barcelona SC. af 매핑(1152) 유지되어 공백 없음.",
  },
  {
    id: 368, source: "thesports", externalId: "318q66h42dzqo9j", teamId: 119230,
    reason: "318q66h42dzqo9j=포르투갈 Nacional(로고 C.D.NACIONAL MADEIRA 확인). teamId 119230=우루과이 Club Nacional. af 매핑(2356) 유지.",
  },
  // [B] NBA/NHL 형식 불량 junk — thesports 는 NBA/NHL 소스 아님. ts id 가 해시 아닌 숫자(시드 오류).
  { id: 3662, source: "thesports", externalId: "7", teamId: 545, reason: "NBA Cavaliers junk(ts id=7, 해시 아님). NBA=thesports 미사용." },
  { id: 3669, source: "thesports", externalId: "7", teamId: 734, reason: "NHL Hurricanes junk(ts id=7). NHL=thesports 미사용." },
  { id: 3668, source: "thesports", externalId: "10", teamId: 723, reason: "NHL Canadiens junk(ts id=10)." },
  { id: 3667, source: "thesports", externalId: "17", teamId: 737, reason: "NHL Avalanche junk(ts id=17)." },
  { id: 3663, source: "thesports", externalId: "24", teamId: 521, reason: "NBA Knicks junk(ts id=24)." },
  { id: 3664, source: "thesports", externalId: "25", teamId: 546, reason: "NBA Thunder junk(ts id=25)." },
  { id: 3665, source: "thesports", externalId: "31", teamId: 394859, reason: "NBA Spurs junk(ts id=31)." },
  { id: 3666, source: "thesports", externalId: "37", teamId: 744, reason: "NHL Golden Knights junk(ts id=37)." },
];

// 오염으로 mirror 된 nameKo 교정 (thesports 매핑 삭제 후 daily-official-korean 봇이 덮지 않음).
const FIX_NAMEKO = [
  { teamId: 119247, from: "FC 바르셀로나", to: "바르셀로나 SC", reason: "에콰도르 Barcelona SC 가 FC 바르셀로나 ts id 로 오염되며 nameKo 도 오염됨. ECUADOR_LP row(288825)와 일치시킴." },
];

async function main() {
  console.log(`모드: ${APPLY ? "APPLY (실제 삭제)" : "DRY-RUN"}\n`);
  console.log("=== TeamSourceId 삭제 대상 검증 ===");
  const toDelete = [];
  for (const spec of DELETE_ROWS) {
    const row = await prisma.teamSourceId.findUnique({
      where: { id: spec.id },
      select: { id: true, source: true, externalId: true, teamId: true, league: true },
    });
    if (!row) { console.log(`  SKIP row#${spec.id}: 이미 없음`); continue; }
    const ok = row.source === spec.source && row.externalId === spec.externalId && row.teamId === spec.teamId;
    if (!ok) {
      console.log(`  ABORT row#${spec.id}: 튜플 불일치 — DB=(${row.source},${row.externalId},${row.teamId}) 기대=(${spec.source},${spec.externalId},${spec.teamId})`);
      throw new Error(`row#${spec.id} 검증 실패 — 데이터가 조사 시점과 다름. 재조사 필요.`);
    }
    console.log(`  OK   row#${spec.id} (${row.source}, ${row.externalId}, mapL=${row.league}) → teamId=${row.teamId}`);
    console.log(`         근거: ${spec.reason}`);
    toDelete.push(spec.id);
  }

  console.log("\n=== nameKo 교정 대상 ===");
  const toFix = [];
  for (const f of FIX_NAMEKO) {
    const t = await prisma.team.findUnique({ where: { id: f.teamId }, select: { id: true, name: true, nameKo: true } });
    if (!t) { console.log(`  SKIP teamId=${f.teamId}: 없음`); continue; }
    if (t.nameKo !== f.from) { console.log(`  SKIP teamId=${f.teamId}: 현재 nameKo="${t.nameKo}" (기대 "${f.from}") — 건너뜀`); continue; }
    console.log(`  teamId=${f.teamId} "${t.name}": nameKo "${f.from}" → "${f.to}"`);
    toFix.push(f);
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] 삭제 예정 ${toDelete.length}건, nameKo 교정 ${toFix.length}건. --apply 로 실행.`);
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const del = await tx.teamSourceId.deleteMany({ where: { id: { in: toDelete } } });
    let fixed = 0;
    for (const f of toFix) {
      await tx.team.update({ where: { id: f.teamId }, data: { nameKo: f.to } });
      fixed++;
    }
    return { deleted: del.count, fixed };
  });
  console.log(`\n[APPLY] 삭제 ${result.deleted}건, nameKo 교정 ${result.fixed}건 완료.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
