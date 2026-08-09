// 예정 경기 예측 생성 cron — 경기 전에 픽을 확정해 사전 노출(/picks/strong)이 가능하게 한다.
// 선발 투수·배당 갱신 뒤에 돌아야 그 정보가 반영된 픽이 나온다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runPredictUpcoming } from "@/jobs/predict-upcoming";

export const dynamic = "force-dynamic";
// 리그별 전체 매치를 in-memory 로 올려 계산 — 리그 수가 많아 여유를 둔다
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const res = await runPredictUpcoming({ hours: 72, apply: true });
    await recordCronRun("predict-upcoming");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
