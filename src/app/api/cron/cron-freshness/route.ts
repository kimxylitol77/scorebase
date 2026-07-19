// /api/cron/cron-freshness — 핵심 배치 cron 의 dead-man's switch.
// 각 등록 cron 의 마지막 실행(CronRun.lastRunAt)이 기대주기+유예를 넘겼거나, 마지막
// 실행이 실패했으면 텔레그램 알림. "데이터 나이"가 아니라 "cron 실행 여부"를 봐서
// 시즌종료·비수기의 0건 처리(실행은 됨)와 진짜 미실행을 구분한다.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { CRON_REGISTRY } from "@/lib/cron-registry";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOTIFY_DEDUP_MS = 6 * 3600 * 1000; // 같은 cron 6h 내 중복 알림 방지

// 미실행 감지 시 사람 개입 없이 1회 자동 재실행하는 화이트리스트.
// 순수 "외부 fetch → upsert" 멱등 cron 만 — 글 발행·텔레그램 발송류(중복 게시 위험)는 절대 금지.
const AUTO_RETRY = new Set([
  "fetch-transactions",
  "fetch-salaries",
  "mlb-starters",
  "nhl-goalies",
  "league-leaders",
  "standings-collect",
  "baseball-standings",
  "baseball-season-stats",
]);
const RETRY_TIMEOUT_MS = 15_000;
const MAX_RETRIES_PER_PASS = 2; // 한 pass 에서 과도한 연쇄 재실행 방지

/** 누락 cron 1회 재실행. ok=성공 / fail=명시 실패 / timeout=응답 초과(함수는 계속 돌 수 있음). */
async function retryCron(name: string): Promise<"ok" | "fail" | "timeout"> {
  const site = process.env.SITE_URL || "https://www.scorebase.kr";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), RETRY_TIMEOUT_MS);
  try {
    const res = await fetch(`${site}/api/cron/${name}`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    return res.ok ? "ok" : "fail";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "timeout" : "fail";
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const runs = await prisma.cronRun.findMany();
  const byName = new Map(runs.map((r) => [r.name, r]));
  const now = Date.now();

  const problems: { name: string; label: string; reason: string; stale: boolean }[] = [];
  for (const c of CRON_REGISTRY) {
    const r = byName.get(c.name);
    // 아직 한 번도 기록 없음(신규 등록/첫 배포) — 판단 보류, 첫 실행 후부터 감시
    if (!r) continue;
    const ageH = (now - r.lastRunAt.getTime()) / 3600000;
    let reason: string | null = null;
    let stale = false;
    if (ageH > c.maxAgeH) {
      reason = `${ageH.toFixed(0)}h째 미실행 (기대 ${c.maxAgeH}h 내)`;
      stale = true;
    } else if (!r.lastOk) reason = `마지막 실행 실패 — ${r.lastError ?? "원인 미상"}`;
    if (!reason) continue;
    // 6h 내 이미 알린 건 skip (스팸 방지)
    if (r.notifiedAt && now - r.notifiedAt.getTime() < NOTIFY_DEDUP_MS) continue;
    problems.push({ name: c.name, label: c.label, reason, stale });
  }

  // ── 자가치유 — 미실행(stale) + 화이트리스트 cron 은 1회 자동 재실행.
  // 성공하면 🚨 대신 🩹 자가치유 보고로 대체 (사람 개입 0). 실패·초과는 알림 유지.
  const healed: string[] = [];
  let retries = 0;
  for (const p of problems) {
    if (!p.stale || !AUTO_RETRY.has(p.name) || retries >= MAX_RETRIES_PER_PASS) continue;
    retries++;
    const result = await retryCron(p.name);
    if (result === "ok") healed.push(`${p.label} (${p.name})`);
    else if (result === "timeout") p.reason += " · 자동 재실행 트리거함(응답 초과 — 다음 주기 확인)";
    else p.reason += " · 자동 재실행도 실패";
  }
  const remaining = problems.filter((p) => !healed.some((h) => h.includes(p.name)));

  if (healed.length) {
    // 자가치유 성공은 사람 개입 불필요 — 텔레그램 push 대신 /admin/health 아카이브만 (소음 게이트 정책)
    try {
      await prisma.healthCheck.create({
        data: {
          severity: "LOW",
          category: "cron-self-heal",
          key: healed.map((h) => h.split(" ")[0]).join(","),
          message: `누락 cron 자가치유 완료 — ${healed.join(", ")} 재실행 성공`,
        },
      });
    } catch {}
  }
  if (remaining.length) {
    const lines = remaining.map((p) => `• ${p.label} (${p.name}): ${p.reason}`);
    await sendTelegram(`🚨 배치 cron 누락/실패 감지\n\n${lines.join("\n")}`, { parseMode: "Markdown" });
  }
  if (problems.length) {
    await prisma.cronRun.updateMany({
      where: { name: { in: problems.map((p) => p.name) } },
      data: { notifiedAt: new Date() },
    });
  }

  return NextResponse.json({
    ok: true,
    checked: CRON_REGISTRY.length,
    tracked: runs.length,
    problems: remaining.length,
    healed,
    detail: remaining,
  });
}
