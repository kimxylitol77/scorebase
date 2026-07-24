// 리그별 팀 목록 — 마이페이지 대표팀 선택 UI용. 화이트리스트 리그만 허용.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 대표팀으로 고를 수 있는 리그 (팀 데이터가 충분한 것만). search 페이지와 동일 셋.
const ALLOWED = new Set([
  "MLB", "KBO", "NPB", "NBA", "NHL",
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "WORLD_CUP",
]);

export async function GET(req: Request) {
  const league = new URL(req.url).searchParams.get("league") ?? "";
  if (!ALLOWED.has(league)) return NextResponse.json({ teams: [] });

  const teams = await prisma.team.findMany({
    where: { league },
    select: { id: true, name: true, nameKo: true, logoUrl: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ teams });
}
