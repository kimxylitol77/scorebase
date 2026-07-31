// /api/admin/active — 관리자용 현재 접속자 수.
// ActivePresence heartbeat를 sessionId로 중복 제거한다.
// PageView 최근 5분 수치는 배포 전후 비교를 위해 보조 지표로 유지한다.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { detectBot } from "@/lib/bot-detect";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const visibleCutoff = new Date(now - 90 * 1000);
  const hiddenCutoff = new Date(now - 3 * 60 * 1000);
  const last5 = new Date(now - 5 * 60 * 1000);

  const [presenceRows, pageViews] = await Promise.all([
    prisma.activePresence.findMany({
      where: { lastSeenAt: { gte: last5 } },
      select: {
        tabId: true,
        sessionId: true,
        path: true,
        visibility: true,
        section: true,
        userAgent: true,
        lastSeenAt: true,
      },
      take: 10000,
      orderBy: { lastSeenAt: "desc" },
    }),
    prisma.pageView.findMany({
      where: { ts: { gte: last5 } },
      select: { userAgent: true, ts: true },
      take: 10000,
    }),
  ]);

  const humans = presenceRows.filter((r) => !detectBot(r.userAgent).isBot);
  const visibleRows = humans.filter(
    (r) => r.visibility === "visible" && r.lastSeenAt >= visibleCutoff,
  );
  const hiddenRows = humans.filter(
    (r) => r.visibility === "hidden" && r.lastSeenAt >= hiddenCutoff,
  );
  const visibleUsers = new Set(visibleRows.map((r) => r.sessionId));
  const backgroundUsers = new Set(
    hiddenRows
      .filter((r) => !visibleUsers.has(r.sessionId))
      .map((r) => r.sessionId),
  );
  const openUsers = new Set([...visibleUsers, ...backgroundUsers]);
  const liveUsers = new Set(
    visibleRows.filter((r) => r.section === "live").map((r) => r.sessionId),
  );
  const scoresUsers = new Set(
    visibleRows.filter((r) => r.section === "scores").map((r) => r.sessionId),
  );
  const activeTabs = new Set(
    [...visibleRows, ...hiddenRows].map((r) => r.tabId),
  ).size;

  const pathCounts = new Map<string, Set<string>>();
  for (const row of visibleRows) {
    const key = row.path.split("?")[0];
    const set = pathCounts.get(key) ?? new Set<string>();
    set.add(row.sessionId);
    pathCounts.set(key, set);
  }
  const topPaths = [...pathCounts.entries()]
    .map(([path, sessions]) => ({ path, users: sessions.size }))
    .sort((a, b) => b.users - a.users)
    .slice(0, 8);

  let pv5 = 0;
  let pv1 = 0;
  const last1 = new Date(now - 60 * 1000);
  for (const r of pageViews) {
    if (detectBot(r.userAgent).isBot) continue;
    pv5++;
    if (r.ts >= last1) {
      pv1++;
    }
  }

  return NextResponse.json({
    activeNow: visibleUsers.size,
    backgroundNow: backgroundUsers.size,
    openNow: openUsers.size,
    scoresNow: scoresUsers.size,
    liveNow: liveUsers.size,
    activeTabs,
    topPaths,
    // 기존 ActiveUsersBadge 호환. 의미는 최근 PV UA가 아니라 presence 사용자다.
    active5m: openUsers.size,
    active1m: visibleUsers.size,
    pv5m: pv5,
    pv1m: pv1,
    fetchedAt: new Date().toISOString(),
  });
}
