// 밸류 헌터 봇 "라인사냥꾼" cron — 모델·시장 갭이 벌어진 경기만 픽 발행.
// 갭 5%p 이상인 경기가 없으면 0건 발행이 정상 (페르소나 = 가치 없으면 쉰다).
// 수동 트리거: GET /api/cron/value-picks?limit=2  (Bearer CRON_SECRET)

import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runValuePicks } from "@/lib/analysis/value-bot";
import { withLlmTag } from "@/lib/ai/usage-track";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 2, 1), 5);
    const result = await withLlmTag("value-picks", () => runValuePicks(limit));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
