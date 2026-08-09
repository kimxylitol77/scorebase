// 이적시장 예상 XI cron (10:00 KST). 웹서치 2회/일 — 킬스위치 TRANSFER_XI_DISABLED=1.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runGenerateTransferXi } from "@/jobs/generate-transfer-xi";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (process.env.TRANSFER_XI_DISABLED === "1") {
    return NextResponse.json({ ok: true, skipped: "disabled" });
  }
  try {
    const result = await runGenerateTransferXi();
    await recordCronRun("transfer-xi");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
