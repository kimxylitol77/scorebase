// POST /api/internal/live-commentary
// Mac mini worker (Ollama, Qwen 2.5 14B) 가 라이브 코멘터리를 upsert.
// 후보 1: eventComments[] — 이벤트별 1줄 자연어 (JSON 배열)
// 후보 2: matchSummary — 매치 진행 상황 박스 (3-4문장)
// Bearer auth: env INTERNAL_API_TOKEN.
// 부분 update — 보낸 필드만 갱신, 미전송 필드는 기존 값 유지.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 이벤트 1줄 코멘터리 1건. key 는 이벤트 고유 해시 (예: "goal-78-rashford-home").
 * 같은 key 가 이미 있으면 덮어쓰기 (worker 가 클라이언트 측에서 dedup).
 */
interface EventCommentEntry {
  key: string;
  comment: string;
  at: string; // ISO timestamp
}

interface Body {
  matchId: number;
  league?: string;            // 신규 row 생성 시 필요. 기존 row 면 무시 가능.
  eventComments?: EventCommentEntry[];
  matchSummary?: string;
  scoreSnapshot?: string;     // "2:1 78'" 등
  model?: string;
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function badRequest(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 });
}

export async function POST(req: NextRequest) {
  // ── auth
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  // ── parse + validate
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid json");
  }
  if (typeof body.matchId !== "number") return badRequest("matchId(number) required");

  // 최소 한 개 update 필드는 있어야 함
  const hasUpdate =
    body.eventComments !== undefined ||
    body.matchSummary !== undefined ||
    body.scoreSnapshot !== undefined;
  if (!hasUpdate) return badRequest("eventComments / matchSummary / scoreSnapshot 중 하나 이상 필요");

  // matchSummary 가 들어오면 summaryAt 도 함께 갱신
  // eventComments 는 worker 측 entry 안에 at 가 있어 별도 timestamp 필드 불요

  // ── Match 존재 + league 확인
  const match = await prisma.match.findUnique({
    where: { id: body.matchId },
    select: { id: true, league: true },
  });
  if (!match) return NextResponse.json({ error: "match not found" }, { status: 404 });

  const league = body.league ?? match.league;
  const model = body.model ?? "ollama-qwen2.5-14b";
  const now = new Date();

  // ── 부분 update 데이터 구성
  const update: Record<string, unknown> = { model };
  if (body.eventComments !== undefined) {
    update.eventComments = body.eventComments as unknown as Prisma.InputJsonValue;
  }
  if (body.matchSummary !== undefined) {
    update.matchSummary = body.matchSummary;
    update.summaryAt = now;
  }
  if (body.scoreSnapshot !== undefined) update.scoreSnapshot = body.scoreSnapshot;

  // ── upsert
  const row = await prisma.liveCommentary.upsert({
    where: { matchId: body.matchId },
    create: {
      matchId: body.matchId,
      league,
      eventComments: (body.eventComments ?? Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
      matchSummary: body.matchSummary ?? null,
      summaryAt: body.matchSummary !== undefined ? now : null,
      scoreSnapshot: body.scoreSnapshot ?? null,
      model,
    },
    update,
    select: { matchId: true, league: true, updatedAt: true, summaryAt: true },
  });

  return NextResponse.json({ ok: true, row });
}
