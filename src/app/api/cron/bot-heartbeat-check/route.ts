// Vercel cron — 매 10분 외부 워커 heartbeat 점검.
// lastAt 이 30분 이상 오래된 워커 + (이전 알림 없거나 1시간 이상 전) → 텔레그램 알림.
// CRON_SECRET 인증 (기존 cron 패턴 동일).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_STALE_MS = 30 * 60 * 1000;   // 기본 30분 무응답 → down
const RENOTIFY_MS = 60 * 60 * 1000; // 1시간마다만 재알림 (중복 방지)

// 봇별 expected interval (ms) — interval × 4 초과 시 down 판단.
// 봇이 자체 주기가 길면 (예: weekly) 그에 맞춰 임계값 늘림.
const BOT_INTERVAL_MS: Record<string, number> = {
  "mac-mini-match-narrator": 5 * 60 * 1000,
  "mac-mini-endpoint-monitor": 5 * 60 * 1000,
  "mac-mini-live-scores-watcher": 60 * 1000,
  "mac-mini-live-scores": 60 * 1000,
  "mac-mini-data-quality": 15 * 60 * 1000,
  "mac-mini-api-quota": 30 * 60 * 1000,
  "mac-mini-preview-coverage": 30 * 60 * 1000,
  // route-guardian 는 24h 주기 데몬(하루 1회 sitemap 전수 크롤 후 heartbeat 1회). 미등록 시 기본
  // 30분 임계라 실행 직후 ~23.5h 동안 매일 false positive DOWN 알림 났음 → daily 등록(임계 24h×4).
  "mac-mini-route-guardian": 24 * 60 * 60 * 1000,
  "mac-mini-weekly-player-names": 7 * 24 * 60 * 60 * 1000,
  // lightsail daily cron (KST 03시 1회). 미등록 시 기본 30분 임계라
  // 03시 실행 후 매일 false positive 알림 났음 → daily 주기 등록(임계 24h×4=4일).
  "lightsail-baseball-player-names": 24 * 60 * 60 * 1000,
};

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
