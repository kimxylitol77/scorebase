import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runAnalysis } from "@/jobs/generate-analysis";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // 자동 발행 일시 중단 (2026-05-27 SEO 진단) — env GENERATE_DISABLED=1 시 skip.
  // ?force=1 로 수동 override 가능.
  const url = new URL(req.url);
  if (process.env.GENERATE_DISABLED === "1" && url.searchParams.get("force") !== "1") {
    return NextResponse.json({ ok: true, skipped: "GENERATE_DISABLED" });
  }
  try {
    await withLlmTag("analysis", () => runAnalysis());
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
