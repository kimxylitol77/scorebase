// id 목록으로 경기 정보 조회 — 마이페이지 즐겨찾기 경기 카드용.
// localStorage 의 meta 는 별표 누른 시점의 스냅샷이라 점수·상태가 낡는다. 표시용 최신값은 여기서.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { parseRound } from "@/lib/sports/fixture-rounds";
import { sportCodeForLeague, SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { matchLiveHref } from "@/lib/links/match-live-link";

export const dynamic = "force-dynamic";

const MAX_IDS = 50;

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("ids") ?? "";
  const ids = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ).slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ matches: [] });

  const rows = await prisma.match.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, league: true, externalId: true, status: true, startTime: true,
      homeScore: true, awayScore: true, raw: true,
      predHome: true, predDraw: true, predAway: true, oddsHome: true, oddsDraw: true, oddsAway: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  });

  const matches = rows.map((m) => ({
    id: m.id,
    league: m.league,
    externalId: m.externalId,
    status: m.status,
    startTime: m.startTime.toISOString(),
    homeName: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
    awayName: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
    homeLogo: m.homeTeam.logoUrl ?? null,
    awayLogo: m.awayTeam.logoUrl ?? null,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    // /scores "내 경기" 스코어보드 표용(2026-09-28) — 종목·AI 확률·배당·상세 링크
    sport: sportCodeForLeague(m.league),
    href: matchLiveHref(m.league, m.externalId, m.id),
    pred:
      m.predHome != null && m.predAway != null
        ? { home: m.predHome, draw: SOCCER_LEAGUES.has(m.league) ? m.predDraw ?? 0 : null, away: m.predAway }
        : null,
    odds: m.oddsHome != null && m.oddsAway != null ? { home: m.oddsHome, draw: m.oddsDraw ?? 0, away: m.oddsAway } : null,
    // 라운드(축구 정규 라운드만) — PiP 중계형 상단 바 "프리미어리그 5R"
    round: parseRound(typeof m.raw === "string" ? m.raw : m.raw == null ? null : JSON.stringify(m.raw)),
  }));
  return NextResponse.json({ matches });
}
