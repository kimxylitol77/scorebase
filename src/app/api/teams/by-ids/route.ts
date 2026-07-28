// id 목록으로 팀 정보 조회 — 마이페이지 즐겨찾기 팀 카드용.
// localStorage 에는 id 만 남아 있는 경우가 있어(구 팔로우 버튼 형식) 이름·로고를 서버에서 채운다.
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
  if (ids.length === 0) return NextResponse.json({ teams: [] });

  const rows = await prisma.team.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, nameKo: true, logoUrl: true, league: true },
  });
  const teams = rows.map((t) => ({
    id: t.id,
    name: toKoreanTeamName(t.name, t.league) || t.nameKo || t.name,
    league: t.league,
    logoUrl: t.logoUrl,
  }));
  return NextResponse.json({ teams });
}
