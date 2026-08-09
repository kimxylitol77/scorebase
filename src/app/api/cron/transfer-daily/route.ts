// 이적시장 데일리 발행 cron. 기본 OFF — env TRANSFER_DAILY_ENABLED=1 일 때만 발행 (TACTICAL_ENABLED 패턴).
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runGenerateTransferDaily } from "@/jobs/generate-transfer-daily";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const url = new URL(req.url);
  // opt-in 게이트 — 기본 OFF. Vercel env TRANSFER_DAILY_ENABLED=1 로 켠다. force=1 은 수동 테스트용.
  if (process.env.TRANSFER_DAILY_ENABLED !== "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  try {
    const result = await runGenerateTransferDaily();
    await recordCronRun("transfer-daily");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
