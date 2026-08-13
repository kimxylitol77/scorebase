// /api/cron/league-sim-snapshot — 시즌 리그 Monte Carlo 일일 스냅샷 (우승·PO 확률 추이).
// ?league=KBO 단일 리그, 파라미터 없으면 KBO·NPB·MLB 전체 순회 (cron 1줄로 3리그).
// vercel.json schedule: UTC 22:00 = KST 07:00 (전날 경기 종료 + collect 06:00 이후).
// (league, date) 당 1 row upsert — 재실행 시 최신으로 덮음. 월드컵은 wc-sim-snapshot 별도.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import { currentSeasonStart } from "@/lib/predict/season-window";
import { recordCronRun } from "@/lib/cron-registry";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";
import type { PredictMatch } from "@/lib/predict/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SUPPORTED = new Set(["KBO", "NPB", "MLB"]);

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const param = url.searchParams.get("league")?.toUpperCase();
  if (param && !SUPPORTED.has(param)) {
    return NextResponse.json({ ok: false, error: `unsupported league ${param}` }, { status: 400 });
  }
  const leagues = param ? [param] : [...SUPPORTED];
  try {
    const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const results: Record<string, string> = {};

    for (const league of leagues) {
      // 시즌 창으로 자른다 — 없으면 지난 시즌 경기까지 standings 에 누적돼 선두에게 가짜 확신이
      // 붙는다. 2026-08-13 실측: KBO 가 2025+2026 합산 승점으로 계산돼 삼성 99.84%·LG 0.02%
      // (실제 2026 만 보면 KT 1위·삼성 2위, 승차 2.5). predictions/[league] 는 2026-07-02 감사
      // 때 같은 버그를 고쳤는데 이 cron 만 누락돼 스냅샷 이력 전체가 오염됐다.
      const seasonStart = currentSeasonStart(league);
      // 올스타전 제외 — 3리그 전부 올스타전이 정규 리그로 내려와 스냅샷 표를 12팀으로 부풀린다
      const dbMatches = stripBaseballAllStarMatches(
        await prisma.match.findMany({
          where: {
            league: league as never,
            ...(seasonStart ? { startTime: { gte: seasonStart } } : {}),
          },
          select: {
            id: true, league: true, status: true, homeTeamId: true, awayTeamId: true,
            homeScore: true, awayScore: true, startTime: true,
          },
        }),
      );
      const finished = dbMatches.filter((m) => m.status === "FINISHED").length;
      if (finished < 20) {
        results[league] = `skipped (finished ${finished} < 20)`;
        continue;
      }
      const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));
      const mc = runMonteCarlo(matches, league, { iterations: 5000, relegationCount: 0 });
      if (mc.length === 0) {
        results[league] = "empty sim";
        continue;
      }

      const teams = await prisma.team.findMany({
        where: { id: { in: mc.map((r) => r.teamId) } },
        select: { id: true, name: true },
      });
      const nameById = new Map(teams.map((t) => [t.id, t.name]));
      const data = mc.map((r) => ({
        team: nameById.get(r.teamId) ?? String(r.teamId),
        champion: r.champion,
        po: r.top5, // KBO 포스트시즌(5강) 진출 확률 — NPB·MLB 는 PO 구조가 달라 참고용
        expectedPosition: +r.expectedPosition.toFixed(2),
        currentPosition: r.currentPosition,
      }));
      await prisma.leagueSimSnapshot.upsert({
        where: { league_date: { league, date } },
        create: { league, date, data },
        update: { data },
      });
      const top = [...data].sort((a, b) => b.champion - a.champion)[0];
      results[league] = `${top.team} ${(top.champion * 100).toFixed(1)}%`;
    }
    await recordCronRun("league-sim-snapshot");
    return NextResponse.json({ ok: true, date, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
