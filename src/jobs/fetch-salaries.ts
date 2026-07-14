// 선수 연봉 수집 잡 — NBA(basketball-reference)·MLB(spotrac) 스크래핑 + KBO(큐레이션) → PlayerSalary replace.
// /api/cron/fetch-salaries 호출 + 수동: npm run job:salaries
//
// "현재 시즌 스냅샷" → league 전체 deleteMany 후 createMany (rank 변동·은퇴 자동 정리).
// ⚠️ 파싱 0건이면 해당 league replace 안 함 — 스크래핑 실패(봇차단·구조변경) 시 빈 테이블 덮어쓰기 방지.
// ⚠️ KBO 는 정적 큐레이션(만원 단위) — statiz 로그인 벽으로 자동 스크랩 불가. cron 마다 멱등 replace.

import { prisma } from "@/lib/db";
import { fetchNbaSalaries, currentSeasonLabel } from "@/lib/sports/nba-salaries";
import { fetchMlbSalaries, mlbSeasonLabel } from "@/lib/sports/mlb-salaries";
import { fetchNhlSalaries, nhlSeasonLabel } from "@/lib/sports/nhl-salaries";
import { getKboSalaries, KBO_SALARY_SEASON } from "@/lib/sports/kbo-salaries";

interface LeagueResult {
  league: string;
  fetched: number;
  replaced: boolean;
}

/** 한 리그 연봉 replace — 파싱 0건이면 기존 유지. */
async function replaceLeague(
  league: string,
  rows: NormalizedRow[],
  season: string,
): Promise<LeagueResult> {
  if (rows.length === 0) {
    console.warn(`[fetch-salaries] ${league}: 파싱 0건 — 스크래핑 실패 의심, 기존 데이터 유지(replace skip)`);
    return { league, fetched: 0, replaced: false };
  }
  await prisma.$transaction([
    prisma.playerSalary.deleteMany({ where: { league } }),
    prisma.playerSalary.createMany({
      data: rows.map((r) => ({
        league,
        season,
        rank: r.rank,
        playerName: r.playerName,
        position: r.position ?? null,
        teamName: r.teamName,
        salary: r.salary,
        photoUrl: r.photoUrl ?? null,
      })),
    }),
  ]);
  console.log(`[fetch-salaries] ${league}: ${rows.length}명 replace (시즌 ${season})`);
  return { league, fetched: rows.length, replaced: true };
}

interface NormalizedRow {
  rank: number;
  playerName: string;
  teamName: string;
  position?: string | null; // KBO 포지션(포수·투수·내야수·외야수). NBA/MLB 는 미사용.
  salary: number;
  photoUrl?: string;
}

export async function runFetchSalaries(): Promise<{ results: LeagueResult[] }> {
  const now = new Date();
  // NBA·MLB·NHL 병렬 스크래핑 → 각자 replace (한쪽 실패해도 다른 쪽 진행)
  const [nba, mlb, nhl] = await Promise.all([fetchNbaSalaries(), fetchMlbSalaries(), fetchNhlSalaries()]);
  const results: LeagueResult[] = [];
  results.push(await replaceLeague("NBA", nba, currentSeasonLabel(now)));
  results.push(await replaceLeague("MLB", mlb, mlbSeasonLabel(now)));
  results.push(await replaceLeague("NHL", nhl, nhlSeasonLabel(now)));
  results.push(await replaceLeague("KBO", getKboSalaries(), KBO_SALARY_SEASON));
  return { results };
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
