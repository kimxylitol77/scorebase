// 데일리 health-check cron — Vercel 06:30 KST 호출.
// 17개 체크 함수 직렬 실행 → HealthCheck DB row insert → HIGH 발견 시 텔레그램 발송.

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { runHealthChecks } from "@/lib/health-checks";
import { runAiReview } from "@/lib/health-checks/ai-review";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
// 17개 rule 체크 + (월요일) AI 페이지 5개 검토 (OpenAI 5회 호출 ~10초) — 90초로 늘림.
export const maxDuration = 90;

const SEVERITY_EMOJI: Record<string, string> = {
  HIGH: "🚨",
  MED: "⚠️",
  LOW: "ℹ️",
  OK: "✅",
};

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const startedAt = Date.now();
  const findings = await runHealthChecks();

  // 월요일에만 AI 페이지 검토 — 주 1회 비용 약 $0.005.
  // ?force=ai 쿼리로 강제 실행 가능 (수동 테스트용).
  const url = new URL(req.url);
  const isMondayUtc = new Date().getUTCDay() === 1;
  const forceAi = url.searchParams.get("force") === "ai";
  if (isMondayUtc || forceAi) {
    try {
      const aiFindings = await runAiReview();
      findings.push(...aiFindings);
    } catch (e) {
      findings.push({
        category: "ai-review",
        key: "runner",
        severity: "LOW",
        message: `AI 검토 runner 실패: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }
  // DB insert (createMany — 빠름)
  if (findings.length > 0) {
    await prisma.healthCheck.createMany({
      data: findings.map((f) => ({
        severity: f.severity,
        category: f.category,
        key: f.key,
        message: f.message,
        metadata: f.metadata === undefined ? undefined : (f.metadata as object),
      })),
    });
  } else {
    // 발견 없음 — OK row 1개 (대시보드용 — "최근 체크는 깨끗")
    await prisma.healthCheck.create({
      data: {
        severity: "OK",
        category: "health-check",
        key: "summary",
        message: `정상 — 17개 체크 모두 통과`,
      },
    });
  }

  // HIGH / MED 카운트
  const high = findings.filter((f) => f.severity === "HIGH");
  const med = findings.filter((f) => f.severity === "MED");
  const low = findings.filter((f) => f.severity === "LOW");

  // 텔레그램 발송 — HIGH 가 있으면 무조건, MED 만 있으면 매주 월요일에만, 둘 다 없으면 skip.
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const shouldNotify = high.length > 0 || (med.length > 0 && isMonday);
  if (shouldNotify) {
    const lines: string[] = [];
    lines.push(`*Scorebase Health* — ${now.toISOString().slice(0, 10)}`);
    lines.push(`🚨 HIGH ${high.length} · ⚠️ MED ${med.length} · ℹ️ LOW ${low.length}`);
    lines.push("");
    for (const f of [...high, ...med].slice(0, 15)) {
      const e = SEVERITY_EMOJI[f.severity] ?? "•";
      // Markdown 특수문자 가벼운 이스케이프 (`*` `_` 만)
      const msg = f.message.replace(/[*_`]/g, "\\$&");
      lines.push(`${e} *${f.category}* / ${f.key}\n${msg}`);
    }
    if (high.length + med.length > 15) lines.push(`\n…외 ${high.length + med.length - 15}건. /admin/health 참조.`);
    await sendTelegram(lines.join("\n\n"), { parseMode: "Markdown" });
  }

  return NextResponse.json({
    ok: true,
    durationMs: Date.now() - startedAt,
    counts: { high: high.length, med: med.length, low: low.length },
    notified: shouldNotify,
  });
}

// POST 도 동일하게 허용 — 수동 호출용.
export const POST = GET;
