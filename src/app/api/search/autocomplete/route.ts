// 검색 자동완성 — 팀 + 선수 (시즌 리더 등록된).
// ?q=2글자+ → 최대 12개. 한글/영문 양방향 매칭.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Item {
  type: "team" | "player";
  id: number | string;
  name: string;
  subtitle: string; // "EPL · 리버풀" / "K리그 1 · FW"
  league: string;
  logoUrl?: string | null;
  href: string;
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });

  // 팀 — 영문 또는 한글 매칭 (DB 영문 → toKoreanTeamName 통과 → 한글 비교까지)
  const qLower = q.toLowerCase();
  const teamCandidates = await prisma.team.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { shortName: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, shortName: true, league: true, logoUrl: true },
    take: 60,
  });
  // 한글 매핑 결과로도 한 번 더 필터 (영문 매칭 부족 보강)
  const allTeams = await prisma.team.findMany({
    select: { id: true, name: true, shortName: true, league: true, logoUrl: true },
    take: 5000,
  });
  for (const t of allTeams) {
    const ko = toKoreanTeamName(t.name);
    if (ko !== t.name && ko.toLowerCase().includes(qLower)) {
      if (!teamCandidates.find((x) => x.id === t.id)) {
        teamCandidates.push(t);
      }
    }
  }

  const teamItems: Item[] = teamCandidates.slice(0, 8).map((t) => {
    const ko = toKoreanTeamName(t.name);
    return {
      type: "team",
      id: t.id,
      name: ko || t.name,
      subtitle: t.league,
      league: t.league,
      logoUrl: t.logoUrl,
      href: `/teams/${t.id}`,
    };
  });

  // 선수 — LeagueLeader 테이블 (시즌 리더 등록된 선수만)
  const players = await prisma.leagueLeader.findMany({
    where: {
      OR: [
        { playerName: { contains: q, mode: "insensitive" } },
        { playerNameEn: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      externalId: true,
      playerName: true,
      league: true,
      teamName: true,
    },
    take: 30,
    distinct: ["externalId", "playerName"],
  });

  // 같은 선수 중복 제거 (이미 본 playerName + league)
  const seen = new Set<string>();
  const playerItems: Item[] = [];
  for (const p of players) {
    const k = `${p.playerName}|${p.league}`;
    if (seen.has(k)) continue;
    seen.add(k);
    playerItems.push({
      type: "player",
      id: p.externalId ?? p.playerName,
      name: p.playerName,
      subtitle: `${p.league} · ${p.teamName ?? ""}`.trim(),
      league: p.league,
      href: p.externalId
        ? `/players/${p.externalId}?league=${encodeURIComponent(p.league)}`
        : `/search?q=${encodeURIComponent(p.playerName)}`,
    });
    if (playerItems.length >= 6) break;
  }

  return NextResponse.json({ items: [...teamItems, ...playerItems].slice(0, 12) });
}
