// GET /api/internal/ts-football-mapping
// Lightsail football-fast-poller 가 MQTT/REST 메시지의 ts match id → 우리 Match.id
// 매핑 시 사용. TheSportsMatchCache 의 축구 매치만 반환 (baseball 은 ts-baseball-mapping).
//
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// 축구 외 리그 — 매핑에서 제외 (야구·농구·하키·e스포츠)
const NON_SOCCER = [
  "KBO", "NPB", "MLB",
  "NBA", "WNBA", "NHL", "LOL",
];

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== expected) return unauthorized();

  const rows = await prisma.theSportsMatchCache.findMany({
    where: { match: { league: { notIn: NON_SOCCER } } },
    select: { tsMatchId: true, matchId: true },
  });
  const mapping: Record<string, number> = {};
  for (const r of rows) {
    if (r.tsMatchId) mapping[r.tsMatchId] = r.matchId;
  }

  // ts- externalId 축구 매치 직접 매핑 — 군소 매치(친선 등)는 팀 매핑이 없어 cache row 가
  // 안 생기고, cache 기반 매핑에만 의존하면 fast-poller 가 MQTT/REST 이벤트를 전부 skip
  // → 점수가 match-collector 1h sweep 으로만 갱신되고 종료 status 못 받아 LIVE 고착
  // (2026-07-11 stale_live 11건 진단). externalId 가 "ts-<id>" 면 ts match id 를 이미
  // 아는 것이므로 cache 없이도 매핑 가능. 배구/야구도 ts- prefix 를 쓰므로 축구 리그만.
  const now = Date.now();
  const tsDirect = await prisma.match.findMany({
    where: {
      league: { in: [...SOCCER_LEAGUES] },
      externalId: { startsWith: "ts-" },
      status: { in: ["SCHEDULED", "LIVE"] },
      startTime: { gte: new Date(now - 24 * 3600 * 1000), lt: new Date(now + 48 * 3600 * 1000) },
    },
    select: { id: true, externalId: true },
  });
  let directAdded = 0;
  for (const m of tsDirect) {
    const tsId = m.externalId.slice(3);
    if (tsId && !(tsId in mapping)) {
      mapping[tsId] = m.id;
      directAdded++;
    }
  }

  return NextResponse.json({ count: rows.length + directAdded, mapping });
}
