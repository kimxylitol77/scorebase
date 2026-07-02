// GET /api/cron/fetch-transactions — ESPN 트랜잭션(NBA) 수집 → SportsTransaction upsert.
// 일 1회 cron (FA 개장 7/1·드래프트 6월 말 시즌엔 빈도 상향 검토).
// 수동: ?leagues=NBA,MLB 로 종목 지정.

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { runFetchTransactions } from "@/jobs/fetch-transactions";
import type { TxLeague } from "@/lib/sports/espn-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const param = new URL(req.url).searchParams.get("leagues");
  const leagues = (param ? param.split(",").filter(Boolean) : ["NBA"]) as TxLeague[];

  try {
    const summary = await runFetchTransactions(leagues);
    await recordCronRun("fetch-transactions");
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
