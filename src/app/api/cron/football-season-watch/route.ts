// /api/cron/football-season-watch — 축구 시즌 전환 감시. 6시간 주기.
//
// 감시 항목 (season-watch.ts 가 단일 판정):
//   - Lightsail standings-poller heartbeat (마지막 실행·성공/실패 리그 수·연속 실패)
//   - ACTIVE 시즌인데 순위 캐시가 없는 리그
//   - 개막 14일 이내인데 VERIFIED/ACTIVE 시즌이 없는 리그
//   - 저장소/ACTIVE/캐시 시즌 ID 불일치
//   - 팀 매핑률 95% 미만
//   - 일정은 있는데 순위 소스가 없는 리그
//
// 알림 중복 방지: 리그별 (코드+상세) 지문을 HealthCheck 이력과 비교해, 상태가 안 바뀐 같은 경고는
// 개막까지 남은 일수에 따른 간격(60일 밖 주1 / 30일 이내 일1 / 14일 이내 6h / 3일 이내 즉시)
// 안에서는 다시 보내지 않는다. 발견 자체는 매번 HealthCheck 로 남겨 대시보드에서 추이를 본다.

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { recordCronRun } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";
import { alertIntervalMs, auditFootballSeasons, type LeagueAudit } from "@/lib/sports/season-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATEGORY = "season-transition";

function fingerprint(l: LeagueAudit): string {
  return l.issues.map((i) => `${i.code}:${i.severity}`).sort().join("|");
}

// 예외도 실행 기록으로 남긴다 — 안 남기면 cron-freshness 가 "N시간째 미실행"으로
// 오보한다(2026-08-07 fetch-transactions 실측과 동일 구조).
export async function GET(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    await recordCronRun("football-season-watch", { ok: false, error: (e as Error).message });
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

async function handle(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const audit = await auditFootballSeasons();
  const now = audit.generatedAt;

  // 최근 이력 — 같은 상태의 반복 알림을 막기 위한 지문 비교용.
  const recent = await prisma.healthCheck.findMany({
    where: { category: CATEGORY, runAt: { gte: new Date(now.getTime() - 14 * 86400_000) } },
    orderBy: { runAt: "desc" },
    select: { key: true, message: true, runAt: true, metadata: true },
  });
  const lastNotified = new Map<string, { at: Date; fp: string }>();
  for (const r of recent) {
    if (lastNotified.has(r.key)) continue;
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    if (meta.notified !== true) continue;
    lastNotified.set(r.key, { at: r.runAt, fp: String(meta.fingerprint ?? "") });
  }

  const toAlert: LeagueAudit[] = [];
  const findings: Array<{
    severity: string; key: string; message: string; metadata: Record<string, unknown>;
  }> = [];

  for (const l of audit.exceptions) {
    const fp = fingerprint(l);
    const prev = lastNotified.get(l.league);
    const interval = alertIntervalMs(l.daysToFirstFixture);
    const stateChanged = !prev || prev.fp !== fp;
    const intervalPassed = !prev || now.getTime() - prev.at.getTime() >= interval;
    const notify = stateChanged || intervalPassed;
    if (notify) toAlert.push(l);
    findings.push({
      severity: l.issues.some((i) => i.severity === "HIGH")
        ? "HIGH"
        : l.issues.some((i) => i.severity === "MED")
          ? "MED"
          : "LOW",
      key: l.league,
      message: `${l.league} ${l.state} — ${l.issues.map((i) => i.detail).join(" · ")}`,
      metadata: {
        notified: notify,
        fingerprint: fp,
        issues: l.issues,
        state: l.state,
        standingsSource: l.standingsSource,
        daysToFirstFixture: l.daysToFirstFixture,
        activeSeasonId: l.activeSeasonId,
        cacheSeasonId: l.cacheSeasonId,
        repoSeasonId: l.repoSeasonId,
        mappingRate: l.mappingRate,
      },
    });
  }

  // poller 생사 — 리그와 별도 key.
  const pollerDown = audit.summary["poller-down"] === 1;
  const prevPoller = lastNotified.get("__poller__");
  const pollerFp = pollerDown ? `down:${audit.poller.consecutiveFailures ?? 0}` : "up";
  const pollerNotify =
    pollerDown && (!prevPoller || prevPoller.fp !== pollerFp || now.getTime() - prevPoller.at.getTime() >= 6 * 3600_000);
  if (pollerDown) {
    findings.push({
      severity: "HIGH",
      key: "__poller__",
      message: `standings-poller 무응답 — 마지막 ping ${audit.poller.ageMin == null ? "기록 없음" : `${audit.poller.ageMin.toFixed(0)}분 전`}`,
      metadata: { notified: pollerNotify, fingerprint: pollerFp, poller: audit.poller },
    });
  }

  if (findings.length > 0) {
    await prisma.healthCheck.createMany({
      data: findings.map((f) => ({
        severity: f.severity,
        category: CATEGORY,
        key: f.key,
        message: f.message.slice(0, 900),
        metadata: f.metadata as object,
      })),
    });
  }

  // 텔레그램 — 새로 발생했거나 재알림 간격이 지난 것만.
  const high = toAlert.filter((l) => l.issues.some((i) => i.severity === "HIGH"));
  if (pollerNotify || high.length > 0) {
    const lines = [
      `⚽ <b>시즌 전환 감시</b>`,
      ``,
      ...(pollerNotify
        ? [
            `🚨 <b>standings-poller 무응답</b>`,
            `   마지막 ping: ${audit.poller.ageMin == null ? "기록 없음" : `${audit.poller.ageMin.toFixed(0)}분 전`}`,
            `   연속 실패: ${audit.poller.consecutiveFailures ?? "-"}회`,
            ``,
          ]
        : []),
      ...(high.length > 0
        ? [
            `📍 <b>즉시 확인 ${high.length}개 리그</b>`,
            ...high.slice(0, 12).map((l) => `   • ${l.league} — ${l.issues[0].detail}`),
            ...(high.length > 12 ? [`   … 외 ${high.length - 12}개`] : []),
            ``,
          ]
        : []),
      `📊 검사 ${audit.summary.checked}리그 · 예외 ${audit.exceptions.length}리그`,
      `➡️ 상세: npm run audit:football-seasons`,
    ];
    try {
      await sendTelegram(lines.join("\n"));
    } catch (e) {
      console.warn("[football-season-watch] telegram 실패:", (e as Error).message);
    }
  }

  await recordCronRun("football-season-watch", { count: audit.exceptions.length });
  return NextResponse.json({
    success: true,
    checked: audit.summary.checked,
    exceptions: audit.exceptions.length,
    alerted: toAlert.length + (pollerNotify ? 1 : 0),
    summary: audit.summary,
    poller: audit.poller,
  });
}
