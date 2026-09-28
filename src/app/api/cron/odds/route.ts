import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchOdds } from "@/jobs/fetch-odds";

export const dynamic = "force-dynamic";
// 60 → 300 (2026-09-28 전수 점검). 제한에 걸리면 함수가 강제 종료돼 catch 도 못 타고 기록도 안 남는다 — 로그의 504 로만 보인다.
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    // ?leagues=MLB — US 데이게임(KST 01~05시) odds 가 21:00 UTC 단일 런보다 늦게 게시되는
    // 갭을 메우는 15:00 UTC MLB 단독 런용. 미지정 시 기존 전체 수집.
    const leaguesParam = new URL(req.url).searchParams.get("leagues");
    const leagues = leaguesParam?.split(",").map((s) => s.trim()).filter(Boolean);
    const tally = await runFetchOdds(leagues?.length ? { leagues } : undefined);
    await recordCronRun("odds", { count: Object.values(tally).reduce((a, b) => a + (Number(b) || 0), 0) });
    return NextResponse.json({ ok: true, tally });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("odds", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
