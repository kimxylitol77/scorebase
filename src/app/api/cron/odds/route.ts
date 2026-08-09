import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchOdds } from "@/jobs/fetch-odds";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    await recordCronRun("odds");
    return NextResponse.json({ ok: true, tally });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
