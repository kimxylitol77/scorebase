// id 목록으로 경기 정보 조회 — 마이페이지 즐겨찾기 경기 카드용.
// localStorage 의 meta 는 별표 누른 시점의 스냅샷이라 점수·상태가 낡는다. 표시용 최신값은 여기서.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

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
      homeScore: true, awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
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
    homeScore: m.homeScore,
    awayScore: m.awayScore,
  }));
  return NextResponse.json({ matches });
}
