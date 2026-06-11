// GET /api/internal/daily-brief — 아침 운영 브리핑용 일일 집계 (어제 KST 기준).
// mac-mini nightly-report(07:00) 가 호출해 텔레그램 한 장으로 포맷.
// 트래픽(사람/봇·유니크)·AI 적중률·신규 글·봇 실패·오늘 주요 경기.
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { detectBot } from "@/lib/bot-detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KST = 9 * 3600 * 1000;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 어제 KST 00:00 ~ 오늘 KST 00:00
  const nowKst = new Date(Date.now() + KST);
  const todayKst0 = Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) - KST;
  const yStart = new Date(todayKst0 - 24 * 3600 * 1000);
  const yEnd = new Date(todayKst0);
  const todayEnd = new Date(todayKst0 + 24 * 3600 * 1000);

  // ── 트래픽 — UA 로 사람/봇 분리 + 사람 유니크(sessionId) ──
  const pvs = await prisma.pageView.findMany({
    where: { ts: { gte: yStart, lt: yEnd } },
    select: { userAgent: true, sessionId: true },
  });
  let human = 0, bot = 0;
  const sessions = new Set<string>();
  for (const p of pvs) {
    if (detectBot(p.userAgent).isBot) bot++;
    else {
      human++;
      if (p.sessionId) sessions.add(p.sessionId);
    }
  }

  // ── AI 적중률 — 어제 종료 매치 (주요 리그별) ──
  const matches = await prisma.match.findMany({
    where: { status: "FINISHED", startTime: { gte: yStart, lt: yEnd }, predCorrect: { not: null } },
    select: { league: true, predCorrect: true },
  });
  const acc: Record<string, { hit: number; total: number }> = {};
  for (const m of matches) {
    const a = (acc[m.league] ??= { hit: 0, total: 0 });
    a.total++;
    if (m.predCorrect) a.hit++;
  }

  // ── 신규 발행 글 ──
  const articles = await prisma.article.groupBy({
    by: ["type"],
    where: { createdAt: { gte: yStart, lt: yEnd } },
    _count: { _all: true },
  }).catch(() => [] as Array<{ type: string; _count: { _all: number } }>);

  // ── 봇 실패 (24h 내 lastErrorAt) ──
  const beats = await prisma.botHeartbeat.findMany({ select: { name: true, metadata: true } });
  const failedBots: Array<{ name: string; error: string }> = [];
  for (const b of beats) {
    const m = (b.metadata ?? {}) as Record<string, unknown>;
    const at = typeof m.lastErrorAt === "string" ? Date.parse(m.lastErrorAt) : 0;
    if (at && Date.now() - at < 24 * 3600 * 1000) {
      failedBots.push({ name: b.name, error: String(m.lastError ?? "").slice(0, 80) });
    }
  }

  // ── 오늘 주요 경기 수 ──
  const todayCnt = await prisma.match.groupBy({
    by: ["league"],
    where: { startTime: { gte: new Date(todayKst0), lt: todayEnd }, league: { in: ["WORLD_CUP", "KBO", "MLB", "NPB"] } },
    _count: { _all: true },
  });

  return NextResponse.json({
    date: new Date(yStart.getTime() + KST).toISOString().slice(0, 10),
    traffic: { human, bot, uniqueVisitors: sessions.size },
    accuracy: Object.fromEntries(
      Object.entries(acc)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 6)
        .map(([lg, v]) => [lg, { hit: v.hit, total: v.total, pct: v.total ? Math.round((v.hit / v.total) * 100) : null }]),
    ),
    newArticles: Object.fromEntries(articles.map((a) => [a.type, a._count._all])),
    failedBots,
    todayMatches: Object.fromEntries(todayCnt.map((t) => [t.league, t._count._all])),
  });
}
