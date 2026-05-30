// GET /api/internal/missing-previews
// 다음 N일 SCHEDULED 매치 중 PREVIEW 글 없는 것 list.
// Bearer auth: INTERNAL_API_TOKEN.
//
// 야구 (KBO/NPB/MLB): 양 팀 선발투수 확정된 매치만 누락으로 카운트.
//   (정책: 야구는 투수 확정 후 PREVIEW 발행)
// 축구/기타: 모든 SCHEDULED 매치.
//
// ARTICLE_LEAGUES 화이트리스트만 (발행 대상과 동일 기준).
//
// Query: ?days=3 (기본 3일)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function parseStarterName(json: string | null | undefined): string | null {
  if (!json) return null;
  try {
    const obj = JSON.parse(json) as { name?: string };
    const n = obj?.name?.trim();
    return n && n.length > 0 ? n : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(7, Number(url.searchParams.get("days") ?? "3")));

  const now = new Date();
  const horizon = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: horizon },
      league: { in: [...ARTICLE_LEAGUES] },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      articles: {
        where: { type: "PREVIEW", status: "PUBLISHED" },
        select: { slug: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  const missing: Array<{
    matchId: number;
    league: string;
    homeName: string;
    awayName: string;
    startTime: string;
    homeStarter: string | null;
    awayStarter: string | null;
    reason: "no_preview" | "baseball_starter_pending";
  }> = [];

  for (const m of matches) {
    const hasPreview = m.articles.length > 0;
    if (hasPreview) continue;

    if (BASEBALL_LEAGUES.has(m.league)) {
      // 야구: 양 팀 투수 확정 시에만 누락 카운트
      const homeStarter = parseStarterName(m.homeStarter);
      const awayStarter = parseStarterName(m.awayStarter);
      const bothConfirmed = !!homeStarter && !!awayStarter;
      if (!bothConfirmed) {
        // 정책상 정상 — skip
        continue;
      }
      missing.push({
        matchId: m.id,
        league: m.league,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        startTime: m.startTime.toISOString(),
        homeStarter,
        awayStarter,
        reason: "no_preview",
      });
    } else {
      missing.push({
        matchId: m.id,
        league: m.league,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
        startTime: m.startTime.toISOString(),
        homeStarter: null,
        awayStarter: null,
        reason: "no_preview",
      });
    }
  }

  // baseball 투수 미확정 (정상 skip) 도 카운트 (참고용)
  const baseballStarterPending: Array<{ matchId: number; league: string; awayName: string; homeName: string; startTime: string }> = [];
  for (const m of matches) {
    if (!BASEBALL_LEAGUES.has(m.league)) continue;
    if (m.articles.length > 0) continue;
    const home = parseStarterName(m.homeStarter);
    const away = parseStarterName(m.awayStarter);
    if (!home || !away) {
      baseballStarterPending.push({
        matchId: m.id,
        league: m.league,
        awayName: m.awayTeam.name,
        homeName: m.homeTeam.name,
        startTime: m.startTime.toISOString(),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    days,
    total_scheduled: matches.length,
    missing_count: missing.length,
    baseball_starter_pending_count: baseballStarterPending.length,
    missing,
    baseball_starter_pending: baseballStarterPending,
  });
}
