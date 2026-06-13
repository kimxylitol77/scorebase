// NBA 연봉 수집 잡 — basketball-reference 스크래핑 → PlayerSalary replace.
// /api/cron/fetch-salaries 호출 + 수동: npm run job:salaries
//
// "현재 시즌 스냅샷" → league 전체 deleteMany 후 createMany (rank 변동·은퇴 자동 정리).
// ⚠️ 파싱 0건이면 replace 안 함 — HTML 스크래핑 실패(봇차단·구조변경) 시 빈 테이블로 덮어쓰기 방지.

import { prisma } from "@/lib/db";
import { fetchNbaSalaries, currentSeasonLabel } from "@/lib/sports/nba-salaries";

export async function runFetchSalaries(): Promise<{
  league: string;
  fetched: number;
  replaced: boolean;
}> {
  const rows = await fetchNbaSalaries();
  if (rows.length === 0) {
    console.warn("[fetch-salaries] NBA: 파싱 0건 — 스크래핑 실패 의심, 기존 데이터 유지(replace skip)");
    return { league: "NBA", fetched: 0, replaced: false };
  }

  const season = currentSeasonLabel(new Date());
  // 트랜잭션으로 묶어 replace — 중간 실패 시 기존 데이터 보존.
  await prisma.$transaction([
    prisma.playerSalary.deleteMany({ where: { league: "NBA" } }),
    prisma.playerSalary.createMany({
      data: rows.map((r) => ({
        league: "NBA",
        season,
        rank: r.rank,
        playerName: r.playerName,
        position: null,
        teamName: r.teamName,
        salary: r.salary,
      })),
    }),
  ]);

  console.log(`[fetch-salaries] NBA: ${rows.length}명 replace (시즌 ${season})`);
  return { league: "NBA", fetched: rows.length, replaced: true };
}

if (process.argv[1]?.includes("fetch-salaries")) {
  runFetchSalaries()
    .then((s) => {
      console.log("done:", JSON.stringify(s));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
