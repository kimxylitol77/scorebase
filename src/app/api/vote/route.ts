// POST /api/vote — 승부예측 원클릭 투표 (비로그인 sessionId / 로그인 userId, 킥오프 전만)
// GET  /api/vote?matchId=N — 로그인 회원의 기존 픽. 카드가 서버에서 cookies() 를 읽으면
//   그 페이지가 통째로 동적 강등돼 ISR 이 죽으므로(2026-08-01), 개인화는 이 라우트로 격리한다.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PICKS = new Set(["home", "draw", "away"]);

export async function GET(req: NextRequest) {
  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isInteger(matchId)) {
    return NextResponse.json({ error: "matchId 필요" }, { status: 400 });
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    // 비로그인은 서버에 픽이 없다 — 클라이언트가 localStorage 폴백을 쓴다.
    return NextResponse.json({ myPick: null, loggedIn: false });
  }
  const mine = await prisma.matchVote.findUnique({
    where: { matchId_userId: { matchId, userId } },
    select: { pick: true },
  });
  return NextResponse.json({ myPick: mine?.pick ?? null, loggedIn: true });
}

export async function POST(req: NextRequest) {
  let body: { matchId?: number; pick?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const matchId = Number(body.matchId);
  const pick = String(body.pick ?? "");
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
  if (!Number.isInteger(matchId) || !PICKS.has(pick)) {
    return NextResponse.json({ error: "matchId·pick 필요" }, { status: 400 });
  }

  const userId = await getCurrentUserId();
  if (!userId && !sessionId) {
    return NextResponse.json({ error: "sessionId 필요" }, { status: 400 });
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { id: true, status: true, startTime: true, oddsHome: true, oddsDraw: true, oddsAway: true },
  });
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });
  // 킥오프 이후 투표·변경 불가 (라이브 중 결과 보고 투표하는 치팅 방지)
  if (match.status !== "SCHEDULED" || match.startTime.getTime() <= Date.now()) {
    return NextResponse.json({ error: "투표가 마감된 경기입니다." }, { status: 409 });
  }

  // CLV 재료 — 픽 시점의 픽 쪽 해외 평균 배당(마진 포함). 배당 없는 경기는 null (CLV 산출 제외).
  const pickOdds =
    pick === "home" ? match.oddsHome : pick === "draw" ? match.oddsDraw : match.oddsAway;
  const oddsFields = { pickOdds: pickOdds ?? null, closeOdds: null, clv: null };
  if (userId) {
    await prisma.matchVote.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId, sessionId: sessionId || null, pick, ...oddsFields },
      update: { pick, correct: null, ...oddsFields },
    });
  } else {
    await prisma.matchVote.upsert({
      where: { matchId_sessionId: { matchId, sessionId } },
      create: { matchId, sessionId, pick, ...oddsFields },
      update: { pick, correct: null, ...oddsFields },
    });
  }

  // 투표 직후 분포 반환 — 위젯이 즉시 결과 화면으로 전환
  const rows = await prisma.matchVote.groupBy({
    by: ["pick"],
    where: { matchId },
    _count: { _all: true },
  });
  const dist: Record<string, number> = { home: 0, draw: 0, away: 0 };
  for (const r of rows) dist[r.pick] = r._count._all;

  return NextResponse.json({ ok: true, myPick: pick, dist, loggedIn: !!userId });
}
