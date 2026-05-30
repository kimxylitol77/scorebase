// GET /api/internal/threads-queue
// Mac mini threads-auto-poster 워커가 "지금 Threads 에 올릴 항목"을 받아가는 큐.
// Bearer auth: INTERNAL_API_TOKEN.
//
// 큐 판단 (발행 이력 ThreadsPost 로 dedup):
//   1) 오늘의 주요 경기 — KST 발행시각(기본 08:00) 이후 & 오늘 미발행 & 경기 1+ 일 때 1건
//   2) 신규 블로그 — 최근 48h 발행 & 미발행 Blog (도배 방지 take 제한)
//
// 응답: { ok, items: [{ kind, refKey, text, imageUrl|null }] }
// 워커는 발행 성공 후 POST /api/internal/threads-posted 로 이력을 남긴다.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { leaguesForSport, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { kstDayWindow, kstHHmm, kstHour } from "@/lib/threads/kst";
import {
  buildDailyCaption,
  buildBlogCaption,
  type DailyMatchLine,
} from "@/lib/threads/caption";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_HOUR_KST = Number(process.env.THREADS_DAILY_HOUR ?? "8");
const DAILY_MAX_LINES = 8;
const BLOG_WINDOW_H = 48;
const BLOG_MAX_PER_CYCLE = 2;

interface QueueItem {
  kind: "DAILY_MATCHES" | "BLOG";
  refKey: string;
  text: string;
  imageUrl: string | null;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  const items: QueueItem[] = [];

  // ── 1) 오늘의 주요 경기 ──
  const { start, end, dateKey, label } = kstDayWindow();
  if (kstHour() >= DAILY_HOUR_KST) {
    const already = await prisma.threadsPost.findUnique({
      where: { kind_refKey: { kind: "DAILY_MATCHES", refKey: dateKey } },
    });
    if (!already) {
      const allLeagues = leaguesForSport("all");
      const priority = new Map(allLeagues.map((lg, i) => [lg, i]));
      const matches = await prisma.match.findMany({
        where: { league: { in: allLeagues }, startTime: { gte: start, lt: end } },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
        take: 200,
      });

      if (matches.length > 0) {
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

        items.push({
          kind: "DAILY_MATCHES",
          refKey: dateKey,
          text: buildDailyCaption(lines, {
            dateLabel: label,
            url: `${SITE_URL}/board`,
            totalCount: matches.length,
          }),
          imageUrl: `${SITE_URL}/api/og/daily?d=${dateKey}`,
        });
      }
    }
  }

  // ── 2) 신규 블로그 ──
  const since = new Date(Date.now() - BLOG_WINDOW_H * 3600 * 1000);
  const blogs = await prisma.blog.findMany({
    where: { publishedAt: { gte: since } },
    orderBy: { publishedAt: "desc" },
    take: 10,
  });
  if (blogs.length > 0) {
    const refKeys = blogs.map((b) => `blog-${b.id}`);
    const posted = await prisma.threadsPost.findMany({
      where: { kind: "BLOG", refKey: { in: refKeys } },
      select: { refKey: true },
    });
    const postedSet = new Set(posted.map((p) => p.refKey));

    let blogCount = 0;
    for (const b of blogs) {
      const refKey = `blog-${b.id}`;
      if (postedSet.has(refKey)) continue;
      const imageUrl = b.thumbnailUrl
        ? b.thumbnailUrl.startsWith("http")
          ? b.thumbnailUrl
          : `${SITE_URL}${b.thumbnailUrl}`
        : null;
      items.push({
        kind: "BLOG",
        refKey,
        text: buildBlogCaption({
          title: b.title,
          excerpt: b.excerpt,
          url: `${SITE_URL}/blog/${b.slug}`,
        }),
        imageUrl,
      });
      if (++blogCount >= BLOG_MAX_PER_CYCLE) break;
    }
  }

  return NextResponse.json({ ok: true, count: items.length, items });
}
