// The Odds API 미커버 확장 리그의 1X2 배당 수집 cron — api-football odds (fetch-af-odds)
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchAfOdds } from "@/jobs/fetch-af-odds";

export const dynamic = "force-dynamic";
// 리그 53개 × (odds 1~5페이지 + fixtures 1콜) 순차 — 60s 로는 뒤쪽 리그가 잘린다 (2026-09-03 확장).
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const leaguesParam = new URL(req.url).searchParams.get("leagues");
    const leagues = leaguesParam?.split(",").map((s) => s.trim()).filter(Boolean);
    const tally = await runFetchAfOdds(leagues?.length ? { leagues } : undefined);
    // 처리 건수를 같이 남긴다 — 없으면 "돌았지만 0건"을 구분할 수 없다
    await recordCronRun("af-odds", { count: Object.values(tally).reduce((a, b) => a + (Number(b) || 0), 0) });
    return NextResponse.json({ ok: true, tally });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("af-odds", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
