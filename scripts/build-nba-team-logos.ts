// NBA Team.logoUrl 을 ESPN 공식 로고로 정정·고정 — 이름 기준 결정적 매핑(스크램블 불가). 멱등.
//
// 배경: 과거 api-sports 매치 payload 의 externalId/logo 가 중복 row·소스 마이그레이션 과정에서
//       팀 정체성과 어긋나 박혀(예: Golden State row 에 Denver 로고) 스크램블됐던 잔재 정리 + 통일.
//       로고 매핑은 src/lib/sports/nba-logos.ts 단일 출처 (collector 와 공유).
//
// 사용:
//   tsx --env-file=.env.local scripts/build-nba-team-logos.ts           # dry-run (기본)
//   tsx --env-file=.env.local scripts/build-nba-team-logos.ts --apply   # 실제 production DB 적용

import { prisma } from "@/lib/db";
import { nbaEspnLogo } from "@/lib/sports/nba-logos";

const APPLY = process.argv.includes("--apply");

async function main() {
  const teams = await prisma.team.findMany({
    where: { league: "NBA" },
    select: { id: true, name: true, logoUrl: true },
    orderBy: { id: "asc" },
  });

  let fixed = 0;
  let already = 0;
  const skipped: typeof teams = [];

  for (const t of teams) {
    const want = nbaEspnLogo(t.name);
    if (!want) {
      skipped.push(t);
      continue;
    }
    if (t.logoUrl === want) {
      already++;
      continue;
    }
    console.log(`${APPLY ? "FIX " : "DRY "}[${t.id}] ${t.name}`);
    console.log(`      old: ${t.logoUrl ?? "(null)"}`);
    console.log(`      new: ${want}`);
    if (APPLY) {
      await prisma.team.update({ where: { id: t.id }, data: { logoUrl: want } });
    }
    fixed++;
  }

  console.log(
    `\n${APPLY ? "[적용]" : "[DRY-RUN]"} 총 ${teams.length}팀 | 정정 ${fixed} | 이미정확 ${already} | NBA외_매핑없음 ${skipped.length}`,
  );
  if (skipped.length) {
    console.log("매핑없음 (NBA 정식 30팀 아님 — 의도적 skip):");
    for (const s of skipped) console.log(`  [${s.id}] ${s.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect().finally(() => process.exit(1));
  });
