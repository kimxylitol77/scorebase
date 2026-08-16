// GET /api/cron/sub-impact — 리그별 교체 임팩트 집계 재계산 (일 1회, KST 새벽).
// ts 캐시 incidents 는 3~4KB/경기라 전 리그 풀스캔도 가볍다.

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { buildSubImpact } from "@/lib/tactical/sub-impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const r = await buildSubImpact();
    await recordCronRun("sub-impact", { ok: true, count: r.games });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await recordCronRun("sub-impact", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
