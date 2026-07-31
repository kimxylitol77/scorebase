// POST /api/internal/bot-heartbeat
// 외부 워커 (Mac mini, Lightsail 등) 가 5분마다 ping.
// upsert lastAt=now(), notifiedAt=null (재시작 시 알림 reset).
// Bearer auth: INTERNAL_API_TOKEN.
//
// v2 (2026-06-11): ok/error/durationMs 수용 — "실행됐지만 실패"를 즉시 정밀 알림.
// 기존 무응답 감시(bot-heartbeat-check)는 죽음만 잡고 매일-실패는 무감지였음
// (daily-official-korean 크래시 무감지 사고). 실패 알림은 봇별 1시간 dedup.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERR_RENOTIFY_MS = 60 * 60 * 1000;

interface Body {
  name: string;             // 워커 식별자 — ex: "mac-mini-match-narrator"
  metadata?: Record<string, unknown>;
  ok?: boolean;             // 이번 실행 성공 여부 (생략 = 단순 생존 ping)
  error?: string;           // ok=false 일 때 에러 요약
  durationMs?: number;      // 이번 실행 소요시간
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

function fmtKst(d: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) return unauthorized("INTERNAL_API_TOKEN unset");
  if (auth !== expected) return unauthorized();

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name(string) required" }, { status: 400 });
  }

  const now = new Date();
  // 실행 결과(ok/error/durationMs)는 metadata 에 합쳐 보존 — 스키마 변경 없이 v2.
  // lastErrNotifiedAt 은 실패 알림 dedup 용으로 라우트가 관리 (클라이언트 값 무시).
  const prev = await prisma.botHeartbeat.findUnique({
    where: { name: body.name },
    select: { metadata: true },
  });
  const prevMeta = (prev?.metadata ?? {}) as Record<string, unknown>;
  const failed = body.ok === false;
  const errText = (body.error || "").slice(0, 400);
  // 연속 실패 횟수 — 한 번 삐끗한 것과 계속 죽어 있는 것을 구분한다(감시 cron 이 판정에 사용).
  const prevStreak = typeof prevMeta.consecutiveFailures === "number" ? prevMeta.consecutiveFailures : 0;
  const streak = body.ok === undefined ? prevStreak : failed ? prevStreak + 1 : 0;
  const meta: Record<string, unknown> = {
    ...(body.metadata ?? {}),
    ...(body.ok !== undefined ? { ok: body.ok } : {}),
    consecutiveFailures: streak,
    ...(failed ? { lastError: errText, lastErrorAt: now.toISOString() } : {}),
    ...(typeof body.durationMs === "number" ? { durationMs: Math.round(body.durationMs) } : {}),
    ...(prevMeta.lastErrNotifiedAt ? { lastErrNotifiedAt: prevMeta.lastErrNotifiedAt } : {}),
  };

  // 실패 즉시 정밀 알림 — 봇별 1시간 dedup (스케줄 봇 spam 없음, 상시 봇 반복 실패 방어)
  if (failed) {
    const lastNotified = typeof prevMeta.lastErrNotifiedAt === "string" ? Date.parse(prevMeta.lastErrNotifiedAt) : 0;
    if (now.getTime() - lastNotified > ERR_RENOTIFY_MS) {
      const lines = [
        `❌ <b>봇 실행 실패</b>`,
        ``,
        `🤖 <b>${body.name}</b>`,
        `🕐 ${fmtKst(now)}${typeof body.durationMs === "number" ? ` · ${Math.round(body.durationMs / 1000)}s` : ""}`,
        ``,
        `💥 ${errText || "(에러 메시지 없음)"}`,
      ];
      try {
        await sendTelegram(lines.join("\n"));
        meta.lastErrNotifiedAt = now.toISOString();
      } catch { /* 알림 실패해도 heartbeat 자체는 저장 */ }
    }
  }

  const row = await prisma.botHeartbeat.upsert({
    where: { name: body.name },
    create: {
      name: body.name,
      lastAt: now,
      metadata: meta as Prisma.InputJsonValue,
    },
    update: {
      lastAt: now,
      metadata: meta as Prisma.InputJsonValue,
      notifiedAt: null, // 재시작 → 다음 down 시 다시 알림 받도록 reset
    },
    select: { name: true, lastAt: true },
  });

  return NextResponse.json({ ok: true, row });
}
