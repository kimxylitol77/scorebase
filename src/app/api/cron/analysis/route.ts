import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runAnalysis } from "@/jobs/generate-analysis";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
// 60 → 300 (2026-09-28 전수 점검). 제한에 걸리면 함수가 강제 종료돼 catch 도 못 타고 기록도 안 남는다 — 로그의 504 로만 보인다.
export const maxDuration = 300;

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
    // 제한 300초 중 230초까지만 새 글을 시작한다 (한 편에 30~60초) — 넘기면 함수가 잘려 기록도 못 남긴다
    await withLlmTag("analysis", () => runAnalysis({ budgetMs: 230_000 }));
    await recordCronRun("analysis");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("analysis", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
