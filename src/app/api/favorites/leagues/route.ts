// 즐겨찾기 리그 서버 동기화 — /scores 사이드바 ☆(useFavoriteLeagues, localStorage)를 로그인 회원 한정으로 미러링.
// GET → 서버 팔로우 리그 코드 목록 · PUT → localStorage 집합으로 전체 교체 (팀/경기 라우트와 같은 시맨틱).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { ALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const dynamic = "force-dynamic";

const MAX_LEAGUES = 30;

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await prisma.userLeagueFollow.findMany({ where: { userId }, select: { league: true } });
  return NextResponse.json({ leagues: rows.map((r) => r.league) });
}

export async function PUT(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { leagues?: unknown[] };
  try {
    body = (await req.json()) as { leagues?: unknown[] };
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  // 등록된 리그 코드만 — 임의 문자열 저장 방지
  const known = new Set(ALL_LEAGUES as readonly string[]);
  const leagues = Array.from(new Set((body.leagues ?? []).filter((v): v is string => typeof v === "string" && known.has(v)))).slice(0, MAX_LEAGUES);

  await prisma.$transaction([
    prisma.userLeagueFollow.deleteMany({ where: { userId, league: { notIn: leagues.length ? leagues : [" "] } } }),
    ...leagues.map((league) =>
      prisma.userLeagueFollow.upsert({
        where: { userId_league: { userId, league } },
        create: { userId, league },
        update: {},
      }),
    ),
  ]);
  return NextResponse.json({ ok: true, count: leagues.length });
}
