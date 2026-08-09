// 선수 수상 경력 수집 cron — daily 250명 순환(전체 ≈ 2주 주기). af /trophies → PlayerTrophy.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { afQuotaBlock } from "@/lib/sports/af-quota";
import { runCollectPlayerTrophies } from "@/jobs/collect-player-trophies";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // af 일일 쿼터가 얼마 안 남았으면 축적성 잡은 물러난다(2026-08-09 소진 사고).
  const blocked = await afQuotaBlock("optional");
  if (blocked) {
    await recordCronRun("player-trophies", { count: 0 });
    return NextResponse.json({ ok: true, skipped: blocked });
  }
  try {
    const result = await runCollectPlayerTrophies();
    await recordCronRun("player-trophies", { count: result.rows });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordCronRun("player-trophies", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
