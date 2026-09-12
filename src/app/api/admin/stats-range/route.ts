// /api/admin/stats-range?range=7d|30d|all — /admin/stats 카드가 기간 탭을 바꿀 때 한 번 받아 캐시하는 기간 지표.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { computeRangeStats, parseStatsRange } from "@/lib/admin/stats-range";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const c = await cookies();
  if (!readSessionCookie(c.get(COOKIE_NAME)?.value)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const range = parseStatsRange(new URL(req.url).searchParams.get("range"));
  const data = await computeRangeStats(range);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
