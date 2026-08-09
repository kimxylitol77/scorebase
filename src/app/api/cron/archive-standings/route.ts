// /api/cron/archive-standings — 일 1회. 시즌별 순위 + 팀 시즌 통계 영구 아카이브 (위키형 데이터 축적).
// 순위 캐시(리그당 1행)·ts 팀 집계가 시즌 롤오버로 덮어써지기 전에 (league/teamId, seasonLabel) 로 굳힌다.
// 본체: src/jobs/archive-standings.ts · src/jobs/archive-team-stats.ts
import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runArchiveStandings } from "@/jobs/archive-standings";
import { runArchiveTeamStats } from "@/jobs/archive-team-stats";
import { runArchiveCoaches } from "@/jobs/archive-coaches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 순위 아카이브 + ts 팀 통계(축구 리그당 1콜, ~130콜)

// 예외도 실행 기록으로 남긴다 — 안 남기면 cron-freshness 가 "N시간째 미실행"으로 오보한다.
export async function GET(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e) {
    await recordCronRun("archive-standings", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runArchiveStandings();
  const teamStats = await runArchiveTeamStats();
  const coaches = await runArchiveCoaches();
  await recordCronRun("archive-standings", { count: result.counts.saved ?? 0 });
  return NextResponse.json({ success: true, ...result, teamStats, coaches });
}
