// POST /api/vote — 승부예측 원클릭 투표 (비로그인 sessionId / 로그인 userId, 킥오프 전만)
//   body { matchId, pick, market?("1X2"|"HANDICAP"|"OU", 기본 1X2), sessionId }. 라인은 서버가 정한다.
// GET  /api/vote?matchId=N — 로그인 회원의 시장별 기존 픽. 카드가 서버에서 cookies() 를 읽으면
//   그 페이지가 통째로 동적 강등돼 ISR 이 죽으므로(2026-08-01), 개인화는 이 라우트로 격리한다.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { isValidPick, isVoteMarket, pickOddsOf, resolveLines, type VoteMarket } from "@/lib/vote-markets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId 필요" }, { status: 400 });
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    // 비로그인은 서버에 픽이 없다 — 클라이언트가 localStorage 폴백을 쓴다.
    return NextResponse.json({ myPick: null, myPicks: {}, loggedIn: false });
  }
  const mine = await prisma.matchVote.findMany({
    where: { matchId, userId },
    select: { market: true, pick: true },
  });
  const myPicks: Record<string, string> = {};
  for (const v of mine) myPicks[v.market] = v.pick;
  // myPick 은 1X2 하위호환 필드.
  return NextResponse.json({ myPick: myPicks["1X2"] ?? null, myPicks, loggedIn: true });
}

export async function POST(req: NextRequest) {
  let body: { matchId?: number; pick?: string; market?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const matchId = Number(body.matchId);
  const pick = String(body.pick ?? "");
  const market: VoteMarket = isVoteMarket(body.market) ? body.market : "1X2";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  if (!Number.isInteger(matchId) || !isValidPick(market, pick)) {
    return NextResponse.json({ error: "matchId·pick 필요" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId && !sessionId) {
    return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, league: true, status: true, startTime: true,
      predHcLine: true,
      oddsHome: true, oddsDraw: true, oddsAway: true,
      oddsHcLine: true, oddsHcHome: true, oddsHcAway: true,
      oddsTotalLine: true, oddsOver: true, oddsUnder: true,
    },
  });
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
  // 킥오프 이후 투표·변경 불가 (라이브 중 결과 보고 투표하는 치팅 방지)
  if (match.status !== "SCHEDULED" || match.startTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: "투표가 마감된 경기입니다." }, { status: 409 });
  }

  // 라인은 서버 단일 결정 — 클라이언트가 보낸 값은 쓰지 않는다. 라인이 없는 시장은 이 경기에서 닫혀 있다.
  const lines = resolveLines(match);
  const line = market === "1X2" ? null : lines[market];
  if (market !== "1X2" && line == null) {
    return NextResponse.json({ error: "이 경기는 해당 시장 투표를 받지 않습니다." }, { status: 409 });
  }

  // CLV 재료 — 픽 시점의 픽 쪽 해외 평균 배당(마진 포함). 배당 없는 경기는 null (CLV 산출 제외).
  const pickOdds = pickOddsOf(market, pick, line, match);
  const oddsFields = { pickOdds: pickOdds ?? null, closeOdds: null, clv: null };
  if (userId) {
    await prisma.matchVote.upsert({
      where: { matchId_userId_market: { matchId, userId, market } },
      create: { matchId, userId, sessionId: sessionId || null, market, line, pick, ...oddsFields },
      update: { pick, line, correct: null, ...oddsFields },
    });
  } else {
    await prisma.matchVote.upsert({
      where: { matchId_sessionId_market: { matchId, sessionId, market } },
      create: { matchId, sessionId, market, line, pick, ...oddsFields },
      update: { pick, line, correct: null, ...oddsFields },
    });
  }

  // 투표 직후 그 시장의 분포 반환 — 위젯이 즉시 결과 화면으로 전환
  const rows = await prisma.matchVote.groupBy({
    by: ["pick"],
    where: { matchId, market },
    _count: { _all: true },
  });
  const dist: Record<string, number> = market === "OU" ? { over: 0, under: 0 } : { home: 0, draw: 0, away: 0 };
  for (const r of rows) dist[r.pick] = r._count._all;

  return NextResponse.json({ ok: true, market, line, myPick: pick, dist, loggedIn: !!userId });
}
