// 일별 사람 트래픽 저장 cron — 매일 00:10 KST(15:10 UTC). 어제·그제분을 DailyTraffic 에 저장한다.
// 그제까지 다시 계산하는 건 자정 직전 PV 가 늦게 쓰이는 경우를 흡수하기 위해서다. ?day=YYYY-MM-DD 로 특정일 재계산(알림 없음).
// 저장 직후 어제분으로 위장 스크레이퍼 급증을 판정해 텔레그램으로 알린다(lib/admin/scraper-surge). ?dry=1 → 판정만, 발송 안 함.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { prisma } from "@/lib/db";
import { kstDayKey, storeDayTraffic } from "@/lib/admin/daily-traffic";
import { detectScraperSurge, surgeMessage } from "@/lib/admin/scraper-surge";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const params = new URL(req.url).searchParams;
  const one = params.get("day");
  const dryRun = params.get("dry") === "1";
  const now = Date.now();
  const days = one && /^\d{4}-\d{2}-\d{2}$/.test(one)
    ? [one]
    : [1, 2].map((n) => kstDayKey(new Date(now - n * 24 * 3600 * 1000)));
  try {
    const out: Record<string, { visitors: number; pv: number; suspicious: number }> = {};
    const analyses = [];
    for (const d of days) {
      const a = await storeDayTraffic(d);
      analyses.push(a);
      out[d] = { visitors: a.visitors, pv: a.pv, suspicious: a.suspicious };
    }
    // 급증 판정 — 기본 실행(어제분)에서만. 기준선은 어제 이전 14일의 저장값.
    let surge = null;
    if (!one) {
      const yesterday = days[0];
      const prev = await prisma.dailyTraffic.findMany({
        where: { day: { lt: yesterday } },
        orderBy: { day: "desc" },
        take: 14,
        select: { suspicious: true },
      });
      surge = detectScraperSurge(analyses[0], prev.map((p) => p.suspicious));
      if (surge.alert && !dryRun) await sendTelegram(surgeMessage(yesterday, analyses[0], surge));
    }
    if (!dryRun) await recordCronRun("daily-traffic", { ok: true, count: days.length });
    return NextResponse.json({ ok: true, dryRun, days: out, surge, topAutomated: analyses[0]?.topAutomated ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
