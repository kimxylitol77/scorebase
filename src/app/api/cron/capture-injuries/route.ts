// 부상자 일일 스냅샷 cron — 결장 영향 백테스트용 원장을 쌓는다.
// ⚠️ 예측을 바꾸지 않는다. 데이터 수집 전용.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runCaptureInjuries } from "@/jobs/capture-injuries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// 리그별 /injuries 순차 호출 — 리그 수만큼 여유를 둔다
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const res = await runCaptureInjuries({ apply: true });
    await recordCronRun("capture-injuries");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
