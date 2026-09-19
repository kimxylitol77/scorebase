// sportspredictions.live 핵심 경기 영어 프리뷰 cron — 하루 2회. 핵심 경기(≤5) 중 프리뷰 없는 것만 생성.
// SP_PREVIEW=off 면 no-op (비용 게이트). 수동: ?limit=N.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { withLlmTag } from "@/lib/ai/usage-track";
import { runSpPreviews } from "@/lib/sp/preview";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  if (process.env.SP_PREVIEW === "off") {
    await recordCronRun("sp-preview", { count: 0 });
    return NextResponse.json({ ok: true, disabled: true });
  }
  const limit = Number(new URL(req.url).searchParams.get("limit")) || undefined;
  await recordCronRun("sp-preview");
  try {
    const r = await withLlmTag("sp-preview", () => runSpPreviews({ limit }));
    await recordCronRun("sp-preview", { count: r.generated });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await recordCronRun("sp-preview", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
