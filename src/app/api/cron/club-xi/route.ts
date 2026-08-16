// 클럽 예상 라인업 갱신 cron — DB 라인업 가중투표 → PredictedXiCache. 하루 2회
// (07:00 KST 아침 갱신 + 19:00 KST 유럽 저녁 킥오프 전 부상 반영).
// 맥북 크론(cron-wc-xi.sh)의 이관 — sleep 결손·git push 경합 제거 (2026-08-17).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runBuildClubXi } from "@/jobs/build-club-xi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const res = await runBuildClubXi();
    await recordCronRun("club-xi", { ok: true, count: res.teams });
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    await recordCronRun("club-xi", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
