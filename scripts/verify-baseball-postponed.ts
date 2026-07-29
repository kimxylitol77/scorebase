// 야구(KBO/NPB/MLB) 미래 POSTPONED 매치를 api-baseball 원본과 재대조해 오분류를 정정한다.
//
// 배경: 시즌 전체 일정을 미리 백필할 때 api-baseball 이 미확정 미래 경기를 일시적으로
// CANC(Cancelled) 로 응답하는 기벽이 있다 (2026-05-10 KBO 90건 / 2026-05-13 NPB 실사고).
// 우리 매핑 CANC→POSTPONED 자체는 정상이고, collect cron 은 today+7일 창만 보므로
// 창 밖 미래 매치는 소스가 NS 로 정정돼도 몇 달간 갱신되지 않고 고착한다.
// 그 결과 monte-carlo(SCHEDULED 만 시뮬)가 잔여 일정을 과소 계산해 순위 확률이 왜곡된다.
//
// 게이트 3중 — (1) DB status=POSTPONED (2) 킥오프가 미래 (3) 소스 현재 status=NS.
// 실제 연기·취소(POST/CANC/ABD)는 소스가 그대로 주므로 건드리지 않는다.
//
// 실행: npx tsx scripts/verify-baseball-postponed.ts [--apply] [--leagues=KBO,NPB]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEY = process.env.API_BASEBALL_KEY;
if (!KEY) {
  console.error("API_BASEBALL_KEY 없음");
  process.exit(1);
}

// api-sports baseball 리그 ID — src/lib/sports/{kbo,npb,mlb}.ts 의 상수와 동일
const LEAGUE_ID: Record<string, number> = { KBO: 5, NPB: 2, MLB: 1 };

const APPLY = process.argv.includes("--apply");
const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="));
const LEAGUES = leaguesArg ? leaguesArg.split("=")[1].split(",") : ["KBO", "NPB", "MLB"];
const SEASON = new Date().getFullYear();

interface SourceGame {
  id: number;
  date: string;
  status: { long: string; short: string };
}

async function fetchSeason(leagueId: number): Promise<SourceGame[]> {
  const res = await fetch(
    `https://v1.baseball.api-sports.io/games?league=${leagueId}&season=${SEASON}`,
    { headers: { "x-apisports-key": KEY! } },
  );
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    throw new Error(`api-baseball errors: ${JSON.stringify(j.errors)}`);
  }
  return (j.response ?? []) as SourceGame[];
}

async function main() {
  const now = new Date();
  for (const league of LEAGUES) {
    const leagueId = LEAGUE_ID[league];
    if (!leagueId) {
      console.log(`[${league}] api-baseball 리그 ID 미정의 — skip`);
      continue;
    }
    const games = await fetchSeason(leagueId);
    const byId = new Map(games.map((g) => [String(g.id), g]));

    const postponed = await prisma.match.findMany({
      where: { league, status: "POSTPONED", startTime: { gt: now } },
      select: { id: true, externalId: true, startTime: true },
      orderBy: { startTime: "asc" },
    });

    const fixable = postponed.filter((m) => byId.get(m.externalId)?.status.short === "NS");
    const kept = postponed.filter((m) => !fixable.includes(m));

    console.log(
      `[${league}] 미래 POSTPONED ${postponed.length}건 — 정정대상(소스 NS) ${fixable.length} / 유지 ${kept.length}`,
    );
    for (const m of kept) {
      const s = byId.get(m.externalId)?.status.short ?? "(소스에 없음)";
      console.log(`  유지 id=${m.id} ${m.startTime.toISOString().slice(0, 16)} 소스=${s}`);
    }
    if (!fixable.length) continue;

    const months = new Map<string, number>();
    for (const m of fixable) {
      const k = new Date(m.startTime.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 7);
      months.set(k, (months.get(k) ?? 0) + 1);
    }
    console.log(`  정정 월별:`, Object.fromEntries([...months].sort()));

    if (APPLY) {
      const r = await prisma.match.updateMany({
        where: { id: { in: fixable.map((m) => m.id) } },
        data: { status: "SCHEDULED" },
      });
      console.log(`  → SCHEDULED 로 정정 ${r.count}건 적용`);
    } else {
      console.log(`  → dry-run (적용하려면 --apply)`);
    }
  }
  await prisma.$disconnect();
}

main();
