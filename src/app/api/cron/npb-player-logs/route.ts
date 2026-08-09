// NPB 경기별 선수 로그 수집 cron — 일일. npb.jp 박스스코어를 훑어 NpbPlayerGameLog 에 멱등 적재.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { prisma } from "@/lib/db";
import { runCollectNpbPlayerLogs } from "@/jobs/collect-npb-player-logs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  const seasonParam = url.searchParams.get("season");
  const force = url.searchParams.get("force") === "1";
  try {
    // 전날 NPB 종료 경기가 없으면(월요일 휴식기·비시즌) npb.jp 요청을 아낀다.
    if (!seasonParam && !force) {
      const recent = await prisma.match.count({
        where: { league: "NPB", status: "FINISHED", startTime: { gte: new Date(Date.now() - 36 * 3600_000) } },
      });
      if (recent === 0) {
        await recordCronRun("npb-player-logs", { count: 0 });
        return NextResponse.json({ ok: true, skipped: "no-recent-npb-games" });
      }
    }
    const result = await runCollectNpbPlayerLogs(seasonParam ? { season: Number(seasonParam) } : {});
    await recordCronRun("npb-player-logs", { count: result.created });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("npb-player-logs", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
