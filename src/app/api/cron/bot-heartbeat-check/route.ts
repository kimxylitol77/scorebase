// Vercel cron — 매 10분 외부 워커 heartbeat 점검.
// lastAt 이 30분 이상 오래된 워커 + (이전 알림 없거나 1시간 이상 전) → 텔레그램 알림.
// CRON_SECRET 인증 (기존 cron 패턴 동일).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { BOT_INTERVAL_MS } from "@/lib/bot-registry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_STALE_MS = 30 * 60 * 1000;   // 기본 30분 무응답 → down
const RENOTIFY_MS = 60 * 60 * 1000; // 1시간마다만 재알림 (중복 방지)

// 봇별 expected interval (ms) = 단일 레지스트리 (@/lib/bot-registry). interval × 4 초과 시 down.
// (대시보드 BOT_META 와 같은 소스 — 따로 박아서 생긴 드리프트로 false 다운 났던 것 통합.)

function staleThreshold(name: string): number {
  const interval = BOT_INTERVAL_MS[name];
  if (!interval) return DEFAULT_STALE_MS;
  // interval × 4 가 down 판단 — 최소 30분, 최대 14일.
  return Math.max(DEFAULT_STALE_MS, Math.min(interval * 4, 14 * 24 * 60 * 60 * 1000));
}

function authOK(req: Request): boolean {
  const sec = process.env.CRON_SECRET;
  if (!sec) return true; // 로컬 dev — 비밀 없으면 허용.
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${sec}`;
}

function formatKst(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export async function GET(req: Request) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const now = Date.now();
  const rows = await prisma.botHeartbeat.findMany();

  const stale = rows.filter((r) => now - r.lastAt.getTime() > staleThreshold(r.name));
  const toAlert = stale.filter(
    (r) => !r.notifiedAt || now - r.notifiedAt.getTime() > RENOTIFY_MS,
  );

  for (const row of toAlert) {
    const downMin = Math.round((now - row.lastAt.getTime()) / 60000);
    const text = [
      `🔔 <b>워커 응답 없음</b>`,
      ``,
      `🤖 <b>${row.name}</b>`,
      `🕐 마지막: ${formatKst(row.lastAt)} (${downMin}분 전)`,
      ``,
      `Mac mini 또는 워커 프로세스 확인 필요.`,
    ].join("\n");

    await sendTelegram(text);
    await prisma.botHeartbeat.update({
      where: { name: row.name },
      data: { notifiedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    stale: stale.length,
    alerted: toAlert.length,
    workers: rows.map((r) => ({
      name: r.name,
      lastAt: r.lastAt,
      downMin: Math.round((now - r.lastAt.getTime()) / 60000),
    })),
  });
}
