// GET /api/cron/fetch-salaries — NBA 연봉(basketball-reference) → PlayerSalary replace.
// 주 1회 cron (연봉은 거의 불변 — 트레이드/계약 때만 변동).

import { NextResponse, type NextRequest } from "next/server";
import { runFetchSalaries } from "@/jobs/fetch-salaries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const ua = req.headers.get("user-agent") ?? "";
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const vercelCron = ua.includes("vercel-cron");
  if (!cronOk && !vercelCron) {
    const intOk =
      process.env.INTERNAL_API_TOKEN && auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
    if (!intOk) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFetchSalaries();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
