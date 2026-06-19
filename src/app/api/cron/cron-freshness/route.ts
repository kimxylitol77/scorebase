// /api/cron/cron-freshness — 핵심 배치 cron 의 dead-man's switch.
// 각 등록 cron 의 마지막 실행(CronRun.lastRunAt)이 기대주기+유예를 넘겼거나, 마지막
// 실행이 실패했으면 텔레그램 알림. "데이터 나이"가 아니라 "cron 실행 여부"를 봐서
// 시즌종료·비수기의 0건 처리(실행은 됨)와 진짜 미실행을 구분한다.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { CRON_REGISTRY } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NOTIFY_DEDUP_MS = 6 * 3600 * 1000; // 같은 cron 6h 내 중복 알림 방지

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const runs = await prisma.cronRun.findMany();
  const byName = new Map(runs.map((r) => [r.name, r]));
  const now = Date.now();

  const problems: { name: string; label: string; reason: string }[] = [];
  for (const c of CRON_REGISTRY) {
    const r = byName.get(c.name);
    // 아직 한 번도 기록 없음(신규 등록/첫 배포) — 판단 보류, 첫 실행 후부터 감시
    if (!r) continue;
    const ageH = (now - r.lastRunAt.getTime()) / 3600000;
    let reason: string | null = null;
    if (ageH > c.maxAgeH) reason = `${ageH.toFixed(0)}h째 미실행 (기대 ${c.maxAgeH}h 내)`;
    else if (!r.lastOk) reason = `마지막 실행 실패 — ${r.lastError ?? "원인 미상"}`;
    if (!reason) continue;
    // 6h 내 이미 알린 건 skip (스팸 방지)
    if (r.notifiedAt && now - r.notifiedAt.getTime() < NOTIFY_DEDUP_MS) continue;
    problems.push({ name: c.name, label: c.label, reason });
  }

  if (problems.length) {
    const lines = problems.map((p) => `• ${p.label} (${p.name}): ${p.reason}`);
    await sendTelegram(`🚨 배치 cron 누락/실패 감지\n\n${lines.join("\n")}`, { parseMode: "Markdown" });
    await prisma.cronRun.updateMany({
      where: { name: { in: problems.map((p) => p.name) } },
      data: { notifiedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    checked: CRON_REGISTRY.length,
    tracked: runs.length,
    problems: problems.length,
    detail: problems,
  });
}
