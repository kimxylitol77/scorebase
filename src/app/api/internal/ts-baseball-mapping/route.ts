// GET /api/internal/ts-baseball-mapping
// Lightsail baseball-ws-subscriber 가 MQTT 메시지의 ts match id → 우리 Match.id 매핑 시 사용.
// TheSportsMatchCache 에 이미 누적된 매핑을 일괄 반환 (baseball-poller 가 채움).
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports/sport-leagues";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized();
  if (auth !== expected) return unauthorized();

  // baseball 리그 단일 출처 — sport-leagues.ts (KBO/NPB/MLB + 9개 확장)
  const baseballLeagues = SPORTS.find((s) => s.code === "baseball")?.leagues ?? [];
  // detailLive 는 경기당 수십 KB(선수·이닝·투구 기록)라 통째로 읽으면 안 된다 — 필요한 건 _swap 한 비트다.
  // 2026-09-28 실측: 야구 캐시 3,676행을 전부 읽다가 함수가 메모리 부족으로 죽었고(47분간 500 수백 건),
  // 같은 인스턴스에 있던 다른 경로(/api/presence·/api/track·thesports-cache)까지 같이 500 을 냈다.
  const rows = await prisma.$queryRaw<Array<{ tsMatchId: string | null; matchId: number; swap: boolean }>>`
    SELECT c."tsMatchId", c."matchId", COALESCE((c."detailLive"->>'_swap')::boolean, false) AS swap
    FROM "TheSportsMatchCache" c
    JOIN "Match" m ON m.id = c."matchId"
    WHERE m.league IN (${Prisma.join(baseballLeagues)})
  `;
  // swap 플래그는 baseball-poller 가 cache.detailLive._swap 에 합성한 값.
  // ws-subscriber 가 raw ft=[ts_away,ts_home] 를 우리 home/away 관점으로 변환하는 데 사용.
  const mapping: Record<string, { matchId: number; swap: boolean }> = {};
  for (const r of rows) {
    if (!r.tsMatchId) continue;
    mapping[r.tsMatchId] = { matchId: r.matchId, swap: r.swap === true };
  }
  return NextResponse.json({ count: rows.length, mapping });
}
