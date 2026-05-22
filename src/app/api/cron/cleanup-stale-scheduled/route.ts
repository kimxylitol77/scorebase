// /api/cron/cleanup-stale-scheduled — 4시간 주기.
// 시작 시각 + STALE_HOURS 후까지 SCHEDULED 인 매치 → POSTPONED 자동 처리.
// source (ESPN/api-football/TheSports) 무관 — cleanup-ghost 가 cover 못하는 리그
// (USL_CH, JUPILER_PL, SINGAPORE_PL, NPB/KBO 등 비-ESPN) 까지 포괄.
//
// 처리 결과는 텔레그램 알림 (5요소 포맷).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 시작 + 12h 후까지 SCHEDULED 인 매치 = 진짜 미업데이트.
// 정상 매치는 4-5시간 안에 LIVE → FINISHED 전환. 12h 면 안전 마진.
const STALE_HOURS = 12;

export async function GET(req: NextRequest) {
  // Vercel cron secret auth (CRON_SECRET) 또는 INTERNAL_API_TOKEN
  const auth = req.headers.get("authorization") ?? "";
  const cronOk =
    process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const intOk =
    process.env.INTERNAL_API_TOKEN &&
    auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  // Vercel cron 은 user-agent vercel-cron/1.0
  const ua = req.headers.get("user-agent") ?? "";
  const vercelCron = ua.includes("vercel-cron");
  if (!cronOk && !intOk && !vercelCron) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  if (stale.length === 0) {
    return NextResponse.json({ ok: true, marked: 0 });
  }

  await prisma.match.updateMany({
    where: { id: { in: stale.map((m) => m.id) } },
    data: { status: "POSTPONED" },
  });

  // 리그별 카운트 + sample
  const byLeague: Record<string, number> = {};
  for (const m of stale) byLeague[m.league] = (byLeague[m.league] ?? 0) + 1;
  const leagueLines = Object.entries(byLeague)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([l, n]) => `  ${l}: ${n}건`)
    .join("\n");
  const sampleLines = stale
    .slice(0, 5)
    .map(
      (m) =>
        `  ${m.startTime.toISOString().slice(5, 16)} | ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`,
    )
    .join("\n");

  try {
    await sendTelegram(
      `🧹 <b>stale SCHEDULED ${stale.length}건 자동 POSTPONED</b>\n\n` +
        `📍 <b>무엇</b>: 시작 + ${STALE_HOURS}h+ 지났는데 SCHEDULED 상태\n` +
        `💥 <b>영향</b>: /scores 페이지 잘못 노출되던 매치 자동 숨김\n` +
        `🔍 <b>원인</b>: cron 미업데이트 (collector 누락 리그 또는 source API 변화)\n\n` +
        `<b>리그별</b>:\n${leagueLines}\n\n` +
        `<b>sample</b>:\n<code>${sampleLines}</code>\n\n` +
        `<code>[안내] cron-cleanup-stale-scheduled</code>`,
    );
  } catch (e) {
    console.warn("[cleanup-stale-scheduled] telegram fail:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    marked: stale.length,
    byLeague,
    sample: stale.slice(0, 5).map((m) => ({
      id: m.id,
      league: m.league,
      teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
      startTime: m.startTime.toISOString(),
    })),
  });
}
