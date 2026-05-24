// /api/transfers/team/[id] — 우리 DB Team.id 로 api-football transfers fetch.
// 응답 캐시 1시간 (이적 정보 자주 안 바뀜).

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RawTransfer {
  date: string;
  type: string | null;
  teams: {
    in: { id: number; name: string; logo?: string };
    out: { id: number; name: string; logo?: string };
  };
}
interface RawItem {
  player: { id: number; name: string };
  update: string;
  transfers: RawTransfer[];
}

interface OutItem {
  playerId: number;
  playerName: string;
  date: string;
  type: string;
  direction: "in" | "out";
  oppTeam: string;
  oppLogo?: string;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const dbId = parseInt(id);
  if (!Number.isFinite(dbId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({
    where: { id: dbId },
    select: { id: true, name: true, league: true, externalId: true },
  });
  if (!team) return NextResponse.json({ error: "not found" }, { status: 404 });

  // api-football 매핑 리그만 지원 (externalId == api-football team id 가정)
  if (!API_FOOTBALL_LEAGUE_ID[team.league]) {
    return NextResponse.json({ items: [], note: "league not supported" });
  }
  const afTeamId = parseInt(team.externalId);
  if (!Number.isFinite(afTeamId)) {
    return NextResponse.json({ items: [], note: "team id not numeric" });
  }

  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return NextResponse.json({ items: [], note: "no api key" });

  try {
    const res = await fetch(`https://v3.football.api-sports.io/transfers?team=${afTeamId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 3600 }, // 1시간 캐시
    });
    if (!res.ok) {
      return NextResponse.json({ items: [], note: `api-football ${res.status}` });
    }
    const data = (await res.json()) as { response?: RawItem[] };
    const out: OutItem[] = [];
    for (const item of data.response ?? []) {
      for (const tr of item.transfers ?? []) {
        const isIn = tr.teams.in.id === afTeamId;
        out.push({
          playerId: item.player.id,
          playerName: item.player.name,
          date: tr.date,
          type: tr.type ?? "—",
          direction: isIn ? "in" : "out",
          oppTeam: isIn ? tr.teams.out.name : tr.teams.in.name,
          oppLogo: isIn ? tr.teams.out.logo : tr.teams.in.logo,
        });
      }
    }
    // 최신 순 정렬 + 최대 20개
    out.sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ items: out.slice(0, 20) });
  } catch (e) {
    return NextResponse.json({ items: [], error: (e as Error).message }, { status: 200 });
  }
}
