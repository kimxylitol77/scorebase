// POST /api/internal/save-baseball-odds
// Lightsail baseball-odds-poller 가 TheSports `/v1/baseball/odds/history` 응답을 그대로 push.
// 본 endpoint 는 results dict 를 row 단위로 분해 → createMany skipDuplicates.
//
// Bearer auth: env INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  matchId: number;
  tsMatchId: string;
  // TheSports 응답의 results: { [companyId]: { eu?: row[], asia?: row[], bs?: row[] } }
  // row 형식: [ts, v1, mid, v2, status]
  results: Record<string, Partial<Record<"eu" | "asia" | "bs", unknown[][]>>>;
}

type Kind = "eu" | "asia" | "bs";
const KINDS: Kind[] = ["eu", "asia", "bs"];

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function toRow(matchId: number, companyId: string, kind: Kind, raw: unknown[]):
  | { matchId: number; companyId: string; kind: Kind; ts: number; v1: number; mid: number | null; v2: number; status: number }
  | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const ts = Number(raw[0]);
  const v1 = Number(raw[1]);
  const midRaw = raw[2];
  const v2 = Number(raw[3]);
  const statusRaw = raw[4];
  if (!Number.isFinite(ts) || !Number.isFinite(v1) || !Number.isFinite(v2)) return null;
  const mid = midRaw == null || midRaw === "" ? null : Number(midRaw);
  const status = Number.isFinite(Number(statusRaw)) ? Number(statusRaw) : 0;
  return {
    matchId,
    companyId,
    kind,
    ts,
    v1,
    mid: mid != null && Number.isFinite(mid) ? mid : null,
    v2,
    status,
  };
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (typeof body.matchId !== "number" || typeof body.tsMatchId !== "string") {
    return NextResponse.json({ error: "matchId(number) + tsMatchId(string) required" }, { status: 400 });
  }
  if (!body.results || typeof body.results !== "object") {
    return NextResponse.json({ error: "results dict required" }, { status: 400 });
  }

  // 우리 Match 존재 확인 — 없으면 silently skip (worker 가 stale id 호출해도 안전).
  const exists = await prisma.match.findUnique({ where: { id: body.matchId }, select: { id: true } });
  if (!exists) return NextResponse.json({ skipped: "match not found", matchId: body.matchId }, { status: 200 });

  const rows: ReturnType<typeof toRow>[] = [];
  for (const [companyId, payload] of Object.entries(body.results)) {
    if (!payload || typeof payload !== "object") continue;
    for (const kind of KINDS) {
      const list = payload[kind];
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const row = toRow(body.matchId, companyId, kind, raw);
        if (row) rows.push(row);
      }
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, totalRows: 0 });
  }

  // skipDuplicates — @@unique([matchId, companyId, kind, ts]) 가드.
  const result = await prisma.tsBaseballOddsHistory.createMany({
    data: rows.filter((r): r is NonNullable<typeof r> => r !== null),
    skipDuplicates: true,
  });

  return NextResponse.json({ inserted: result.count, totalRows: rows.length });
}
