// 선수 등번호 수집 cron — 주간 1회. 빅5 스쿼드 등번호·af 포지션을 PlayerSquadInfo 에 upsert.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { afQuotaBlock } from "@/lib/sports/af-quota";
import { runCollectSquadNumbers } from "@/jobs/collect-squad-numbers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // af 일일 쿼터가 얼마 안 남았으면 축적성 잡은 물러난다(2026-08-09 소진 사고).
  const blocked = await afQuotaBlock("optional");
  if (blocked) {
    await recordCronRun("squad-numbers", { count: 0 });
    return NextResponse.json({ ok: true, skipped: blocked });
  }
  try {
    const result = await runCollectSquadNumbers();
    await recordCronRun("squad-numbers", { count: result.saved });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("squad-numbers", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
