// GET /api/internal/baseball-missing-player-ids?days=7&league=KBO
// Lightsail kbo-player-names-cron 이 호출 — 최근 N일 매치 detailLive.players 중
// (a) TheSportsPlayer row 자체 없음, 또는 (b) row 는 있지만 nameKo NULL 인 ts player id 반환.
// 위 list 를 cron 이 TheSports player/list?uuid fetch + Anthropic 음역 + upsert.
//
// Bearer auth: INTERNAL_API_TOKEN. league param 은 sport-leagues 의 baseball league 만 허용.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASEBALL_LEAGUES = new Set(
  SPORTS.find((s) => s.code === "baseball")?.leagues ?? [],
);

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "7", 10), 1), 30);
  const league = url.searchParams.get("league") ?? "KBO";
  if (!BASEBALL_LEAGUES.has(league)) {
    return NextResponse.json(
      { error: `league must be one of ${[...BASEBALL_LEAGUES].join(",")}` },
      { status: 400 },
    );
  }

  const since = new Date(Date.now() - days * 86400 * 1000);
  // theSportsCache relation filter (`isNot: null`) 가 Prisma 6 nullable 1:1 에서
  // 매치 0건 반환하는 사고 — 그냥 league+startTime 으로 fetch 후 in-memory skip.
  const matches = await prisma.match.findMany({
    where: { league, startTime: { gte: since } },
    select: { theSportsCache: { select: { detailLive: true } } },
  });

  const allIds = new Set<string>();
  for (const m of matches) {
    const dl = m.theSportsCache?.detailLive as
      | { players?: { home?: Array<{ id?: unknown }>; away?: Array<{ id?: unknown }> } }
      | null;
    if (!dl?.players) continue;
    for (const side of ["home", "away"] as const) {
      const arr = dl.players[side];
      if (!Array.isArray(arr)) continue;
      for (const p of arr) {
        const id = (p as { id?: unknown }).id;
        if (typeof id === "string" && id) allIds.add(id);
      }
    }
  }

  if (allIds.size === 0) {
    return NextResponse.json({ league, days, totalIds: 0, missingIds: [], nameKoNullIds: [] });
  }

  const existing = await prisma.theSportsPlayer.findMany({
    where: { id: { in: [...allIds] } },
    select: { id: true, nameKo: true, photoUrl: true },
  });
  const existingMap = new Map(existing.map((r) => [r.id, r]));

  const missingIds: string[] = [];
  const nameKoNullIds: string[] = [];
  const photoUrlNullIds: Array<{ id: string; nameKo: string }> = [];
  for (const id of allIds) {
    const r = existingMap.get(id);
    if (!r) missingIds.push(id);
    else if (!r.nameKo) nameKoNullIds.push(id);
    else if (!r.photoUrl) photoUrlNullIds.push({ id, nameKo: r.nameKo });
  }

  return NextResponse.json({
    league,
    days,
    totalIds: allIds.size,
    missingIds,
    nameKoNullIds,
    photoUrlNullIds,
  });
}
