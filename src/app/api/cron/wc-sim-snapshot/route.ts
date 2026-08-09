// /api/cron/wc-sim-snapshot — 월드컵 Monte Carlo 시뮬 일일 스냅샷 (우승 확률 추이용).
// vercel.json schedule: UTC 04:00 = KST 13:00 (그날 새벽 종료 경기 결과 반영 후).
// date(KST) 당 1 row upsert — 같은 날 재실행 시 최신으로 덮음.

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { simulateWorldCup } from "@/lib/predict/world-cup-simulation";
import { recordCronRun } from "@/lib/cron-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const kstNow = new Date(Date.now() + 9 * 3600_000);
    const date = kstNow.toISOString().slice(0, 10);
    // 결승(7/19 KST 7/20 새벽) 이후엔 확률이 고정 — 7/21 부터 스냅샷 중단
    if (date > "2026-07-21") {
      await recordCronRun("wc-sim-snapshot");
      return NextResponse.json({ ok: true, skipped: "tournament over" });
    }

    const teams = await prisma.team.findMany({
      where: { league: "WORLD_CUP" },
      select: { id: true, name: true },
    });
    if (teams.length < 32) {
      return NextResponse.json({ ok: false, error: `teams ${teams.length} < 32` }, { status: 500 });
    }
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));
    const sim = simulateWorldCup(teamNameById, 5000);
    if (sim.length === 0) {
      return NextResponse.json({ ok: false, error: "empty sim" }, { status: 500 });
    }

    const data = sim.map((r) => ({
      team: r.teamName,
      groupPass: r.groupPass,
      r16: r.r16,
      qf: r.qf,
      sf: r.sf,
      final: r.final,
      champion: r.champion,
    }));
    await prisma.worldCupSimSnapshot.upsert({
      where: { date },
      create: { date, data },
      update: { data },
    });
    const top = [...data].sort((a, b) => b.champion - a.champion)[0];
    await recordCronRun("wc-sim-snapshot");
    return NextResponse.json({ ok: true, date, teams: data.length, top: `${top.team} ${(top.champion * 100).toFixed(1)}%` });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
