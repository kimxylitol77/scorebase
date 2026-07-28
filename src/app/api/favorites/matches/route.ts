// 즐겨찾기 경기 서버 동기화 — 텔레그램 알림 디스패처가 읽을 서버측 팔로우(UserMatchFollow).
// 클라이언트 localStorage(useFavorites)를 로그인 회원 한정으로 서버에 미러링. teams 라우트와 동일 패턴.
// GET  → 서버 팔로우 matchId 목록
// PUT  → localStorage 경기 집합으로 서버 팔로우 전체 교체
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const MAX_MATCHES = 50;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.userMatchFollow.findMany({
    where: { userId },
    select: { matchId: true },
  });
  return NextResponse.json({ matchIds: rows.map((r) => r.matchId) });
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { matchIds?: Array<number | string> };
  try {
    body = (await req.json()) as { matchIds?: Array<number | string> };
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  // Match.id(Int) 만 — 별표는 DB 매치가 없는 카드(ESPN 전용 종목)에도 붙으므로 숫자만 통과시킨다.
  const matchIds = Array.from(
    new Set(
      (body.matchIds ?? [])
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ).slice(0, MAX_MATCHES);

  await prisma.$transaction([
    // 목록에서 빠진 경기 제거 (빈 목록이면 전부 제거)
    prisma.userMatchFollow.deleteMany({
      where: { userId, matchId: { notIn: matchIds.length ? matchIds : [-1] } },
    }),
    ...matchIds.map((matchId) =>
      prisma.userMatchFollow.upsert({
        where: { userId_matchId: { userId, matchId } },
        create: { userId, matchId },
        update: {},
      }),
    ),
  ]);
  return NextResponse.json({ ok: true, count: matchIds.length });
}
