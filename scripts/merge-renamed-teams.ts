// 개명·연고이전으로 두 row 가 된 팀 통합 — 명시적 페어 목록만 처리한다.
//   npx tsx --env-file=.env.local scripts/merge-renamed-teams.ts           # dry-run
//   npx tsx --env-file=.env.local scripts/merge-renamed-teams.ts --apply
//
// 왜 이름 자동탐지(dedup-teams.mjs)로 안 되나.
//   개명·연고이전 팀은 이름이 아예 다르다(Sichuan Jiuniu → Shenzhen Peng City). normalize
//   비교로는 절대 안 걸리고, 반대로 이름이 비슷한 남남(FC/SV Schaffhausen)을 잘못 묶는다.
//   그래서 사람이 외부 출처로 확인한 페어만 여기 적어 처리한다.
//
// 처리 순서 (트랜잭션).
//   1) 흡수 대상의 Match FK 를 유지 대상으로 이전
//   2) 흡수 대상 Team row 삭제
//   3) 트랜잭션 밖에서 ts team-id-mapping.json 의 ourId 를 유지 대상으로 교체
// 이전 후 같은 팀페어·같은 시각 경기가 중복으로 남는데, 그건 cleanup-duplicate-matches 가
// SAFE 로 분류해 정리한다(이 스크립트는 경기를 지우지 않는다).
import fs from "fs";
import { prisma } from "@/lib/db";

const APPLY = process.argv.includes("--apply");
const MAP_FILE = "src/lib/sports/thesports/team-id-mapping.json";

/** [리그, 유지할 팀 id, 흡수할 팀 id, 근거] — 전부 외부 출처로 확인함(2026-08-27). */
const PAIRS: Array<[string, number, number, string]> = [
  ["CANADA_PL", 290270, 613461, "York United → Inter Toronto FC (2026 리브랜드)"],
  ["CSL", 115883, 613493, "Sichuan Jiuniu → Shenzhen Peng City (2024 연고이전)"],
  ["CSL", 115889, 613494, "Shenyang Urban → Liaoning Tieren (개명)"],
  ["CSL", 115887, 613492, "Qingdao Youth Island → Qingdao West Coast (2023 개명)"],
  // Lincoln 은 여기서 제외한다. Lincoln City#610435 는 league=CLUB_FRIENDLY row 라
  // CHAMPIONSHIP Lincoln#600033 과 다른 리그다 — 팀 row 는 (league, externalId) 단위이고
  // 친선 전용 row 는 의도된 구조라 합치면 안 된다. 문제는 CHAMPIONSHIP 경기 #6144301 이
  // 그 친선 row 를 홈팀으로 물고 있는 오연결이며, af 정본(#1229485)이 따로 있어 중복이다.
  // 그 경기는 cleanup-duplicate-matches 로 따로 정리한다.
];

interface MapEntry { ourId: number; ourName?: string; ourLeague: string; tsId: string }

async function main() {
  console.log(APPLY ? "▶ APPLY — 실제 통합" : "▶ DRY-RUN — DB 미변경");
  let movedTotal = 0;
  let deletedTotal = 0;

  for (const [league, keepId, mergeId, why] of PAIRS) {
    const [keep, merge] = await Promise.all([
      prisma.team.findUnique({ where: { id: keepId }, select: { id: true, name: true, league: true } }),
      prisma.team.findUnique({ where: { id: mergeId }, select: { id: true, name: true, league: true } }),
    ]);
    if (!keep || !merge) {
      console.log(`  [건너뜀] ${league} ${keepId}/${mergeId} — row 없음(이미 처리됨)`);
      continue;
    }
    if (keep.league !== league || merge.league !== league) {
      console.log(`  [중단] ${league} — 리그 불일치 keep=${keep.league} merge=${merge.league}`);
      continue;
    }
    const [home, away] = await Promise.all([
      prisma.match.count({ where: { homeTeamId: mergeId } }),
      prisma.match.count({ where: { awayTeamId: mergeId } }),
    ]);
    console.log(`\n${league} — ${why}`);
    console.log(`  유지 ${keep.name}#${keep.id} ← 흡수 ${merge.name}#${merge.id} (홈 ${home} · 원정 ${away})`);
    movedTotal += home + away;
    deletedTotal++;
    if (!APPLY) continue;

    await prisma.$transaction(async (tx) => {
      await tx.match.updateMany({ where: { homeTeamId: mergeId }, data: { homeTeamId: keepId } });
      await tx.match.updateMany({ where: { awayTeamId: mergeId }, data: { awayTeamId: keepId } });
      await tx.teamSourceId.deleteMany({ where: { teamId: mergeId } });
      await tx.team.delete({ where: { id: mergeId } });
    });
    console.log(`     ✓ 경기 ${home + away}건 이전 · Team row 삭제`);
  }

  // ts 매핑의 ourId 교체 — 삭제된 row 를 가리키면 다음 수집에서 매핑 실패가 난다.
  const entries: MapEntry[] = JSON.parse(fs.readFileSync(MAP_FILE, "utf8"));
  let remapped = 0;
  for (const [, keepId, mergeId] of PAIRS) {
    for (const e of entries) {
      if (e.ourId === mergeId) {
        e.ourId = keepId;
        remapped++;
      }
    }
  }
  console.log(`\nts 매핑 ourId 교체 ${remapped}건`);
  if (APPLY && remapped) {
    fs.writeFileSync(MAP_FILE, JSON.stringify(entries, null, 2) + "\n");
    console.log(`  ${MAP_FILE} 갱신`);
  }

  console.log(
    `\n${APPLY ? "완료" : "예정"} — Team ${deletedTotal}개 흡수 · 경기 ${movedTotal}건 이전 · 매핑 ${remapped}건 교체`,
  );
  if (!APPLY) console.log("적용하려면 --apply. 이후 cleanup-duplicate-matches.ts --apply 로 중복 경기 정리.");
  await prisma.$disconnect();
}

main();
