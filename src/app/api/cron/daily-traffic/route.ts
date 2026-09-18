// 일별 사람 트래픽 저장 cron — 매일 00:10 KST(15:10 UTC). 어제·그제분을 DailyTraffic 에 저장한다.
// 그제까지 다시 계산하는 건 자정 직전 PV 가 늦게 쓰이는 경우를 흡수하기 위해서다. ?day=YYYY-MM-DD 로 특정일 재계산.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { kstDayKey, storeDayTraffic } from "@/lib/admin/daily-traffic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const one = new URL(req.url).searchParams.get("day");
  const now = Date.now();
  const days = one && /^\d{4}-\d{2}-\d{2}$/.test(one)
    ? [one]
    : [1, 2].map((n) => kstDayKey(new Date(now - n * 24 * 3600 * 1000)));
  try {
    const out: Record<string, { visitors: number; pv: number }> = {};
    for (const d of days) out[d] = await storeDayTraffic(d);
    await recordCronRun("daily-traffic", { ok: true, count: days.length });
    return NextResponse.json({ ok: true, days: out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
