// GET /api/internal/daily-sns-preview — 오늘의 주요 경기 카드 캡션 + 이미지 URL 을 dedup 없이 반환.
// 텔레그램 SNS 배달 봇(daily-sns-card)이 매일 11:00 호출. threads-queue(자동 발행 큐)와 달리
// 발행 이력(ThreadsPost)을 보지 않으므로 매번 같은 결과를 주고 자동 발행과 충돌하지 않는다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { leaguesForSport, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { kstDayWindow, kstHHmm } from "@/lib/threads/kst";
import { buildDailyCaption, type DailyMatchLine } from "@/lib/threads/caption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_MAX_LINES = 8;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // comp=wc → 월드컵만, t=tomorrow → 내일 예고, d=YYYY-MM-DD → 특정일
  const url = new URL(req.url);
  const wc = url.searchParams.get("comp") === "wc";
  const tomorrow = url.searchParams.get("t") === "tomorrow";

  const { start, end, dateKey, label } = kstDayWindow(url.searchParams.get("d"));
  const allLeagues = leaguesForSport("all");
  const leagueFilter = wc ? allLeagues.filter((l) => l === "WORLD_CUP") : allLeagues;
  const priority = new Map(allLeagues.map((lg, i) => [lg, i]));

  const matches = await prisma.match.findMany({
    where: { league: { in: leagueFilter }, startTime: { gte: start, lt: end } },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });

  if (matches.length === 0) {
    return NextResponse.json({ ok: true, hasMatches: false, count: 0, caption: null, imageUrl: null });
  }

  // 정렬: LIVE 먼저 → 리그 우선순위 → 이른 시간 (og/daily·threads-queue 와 동일)
  const sorted = [...matches].sort((a, b) => {
    const al = a.status === "LIVE" ? 0 : 1;
    const bl = b.status === "LIVE" ? 0 : 1;
    if (al !== bl) return al - bl;
    const ap = priority.get(a.league) ?? 999;
    const bp = priority.get(b.league) ?? 999;
    if (ap !== bp) return ap - bp;
    return a.startTime.getTime() - b.startTime.getTime();
  });

  const lines: DailyMatchLine[] = sorted.slice(0, DAILY_MAX_LINES).map((m) => ({
    leagueLabel: LEAGUE_DISPLAY[m.league] ?? m.league,
    home: toKoreanTeamName(m.homeTeam.name, m.league),
    away: toKoreanTeamName(m.awayTeam.name, m.league),
    time: kstHHmm(m.startTime),
    live: m.status === "LIVE",
  }));

  return NextResponse.json({
    ok: true,
    hasMatches: true,
    count: matches.length,
    liveCount: matches.filter((m) => m.status === "LIVE").length,
    caption: buildDailyCaption(lines, {
      dateLabel: label,
      url: `${SITE_URL}/board`,
      totalCount: matches.length,
      title: wc ? `🏆 ${tomorrow ? "내일" : "오늘"}의 월드컵 경기` : undefined,
      hashtags: wc ? "#스코어베이스 #월드컵 #2026월드컵 #축구 #국가대표" : undefined,
    }),
    // 인스타 피드 비율(1080×1080)로 — 경기 더 많이 노출
    imageUrl: `${SITE_URL}/api/og/daily?d=${dateKey}&size=portrait${wc ? "&comp=wc" : ""}${tomorrow ? "&t=tomorrow" : ""}`,
  });
}
