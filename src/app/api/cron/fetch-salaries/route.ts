// GET /api/cron/fetch-salaries — NBA 연봉(basketball-reference) → PlayerSalary replace.
// 주 1회 cron (연봉은 거의 불변 — 트레이드/계약 때만 변동).

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchSalaries } from "@/jobs/fetch-salaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFetchSalaries();
    await recordCronRun("fetch-salaries");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
