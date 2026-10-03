// /api/cron/schedule-gap-audit — 축구 리그 일정 공백 매일 감시(2026-10-03).
// 원천(ts diary·api-football)엔 경기가 있는데 DB 엔 없는 리그를 찾아(lib/sports/schedule-gap-audit) HealthCheck 에 남기고,
// 최근 7일 안에 알리지 않은 리그만 텔레그램으로 보낸다. 같은 공백을 매일 반복해서 알리지 않기 위함.
import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { auditScheduleGaps, formatGap } from "@/lib/sports/schedule-gap-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CATEGORY = "schedule-gap";
const RENOTIFY_MS = 7 * 86400_000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    const gaps = await auditScheduleGaps({ days: 30, budgetMs: 200_000 });
    const recent = await prisma.healthCheck.findMany({
      where: { category: CATEGORY, runAt: { gte: new Date(Date.now() - RENOTIFY_MS) } },
      select: { key: true, metadata: true },
    });
    const notified = new Set(recent.filter((r) => (r.metadata as { notified?: boolean } | null)?.notified).map((r) => r.key));
    const fresh = gaps.filter((g) => !notified.has(g.league));
    if (gaps.length) {
      await prisma.healthCheck.createMany({
        data: gaps.map((g) => ({
          severity: g.db === 0 ? "HIGH" : "MED",
          category: CATEGORY,
          key: g.league,
          message: formatGap(g).slice(0, 900),
          metadata: { ...g, notified: !notified.has(g.league) },
        })),
      });
    }
    if (fresh.length) {
      await sendTelegram(
        [
          `<b>[일정 공백] 원천엔 경기가 있는데 DB 에 없는 리그 ${fresh.length}곳</b> (향후 30일)`,
          ...fresh.map((g) => `- ${formatGap(g)}`),
          "",
          "점검: npx tsx --env-file=.env.local scripts/audit-league-schedule-gaps.ts",
        ].join("\n"),
      ).catch(() => undefined);
    }
    await recordCronRun("schedule-gap-audit", { count: gaps.length });
    return NextResponse.json({ ok: true, gaps: gaps.length, notified: fresh.map((g) => g.league) });
  } catch (e) {
    const error = (e as Error).message;
    await recordCronRun("schedule-gap-audit", { ok: false, error }).catch(() => undefined);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
