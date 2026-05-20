// Telegram webhook — 봇 메시지 수신 → 명령어 실행 → 답장.
//
// 보안:
//   1) TELEGRAM_WEBHOOK_SECRET env 등록 → setWebhook 시 secret_token 으로 전달
//   2) Telegram 이 매 요청에 X-Telegram-Bot-Api-Secret-Token 헤더 첨부
//   3) 헤더 mismatch + chat_id mismatch 둘 다 검증 → 외부 spoofing 차단
//
// 지원 명령어:
//   /health  /check          — 즉시 health-check 실행 + 결과 답장
//   /status                  — 마지막 체크 요약
//   /help                    — 명령어 list
//
// 등록:
//   curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
//     -d url=https://www.scorebase.kr/api/telegram/webhook \
//     -d secret_token=$TELEGRAM_WEBHOOK_SECRET

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runHealthChecks } from "@/lib/health-checks";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

const SEVERITY_EMOJI: Record<string, string> = {
  HIGH: "🚨",
  MED: "⚠️",
  LOW: "ℹ️",
  OK: "✅",
};

interface TgUpdate {
  message?: {
    chat?: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
  edited_message?: TgUpdate["message"];
}

function ok() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // 1. secret 헤더 검증
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
    if (got !== expectedSecret) {
      return NextResponse.json({ error: "bad secret" }, { status: 403 });
    }
  }

  let body: TgUpdate;
  try {
    body = (await req.json()) as TgUpdate;
  } catch {
    return ok(); // Telegram retry 회피 — 200 응답
  }
  const msg = body.message ?? body.edited_message;
  if (!msg?.text) return ok();

  // 2. chat_id 화이트리스트 (외부 spoofing 차단)
  const expectedChatId = process.env.TELEGRAM_CHAT_ID;
  const incomingChatId = String(msg.chat?.id ?? "");
  if (expectedChatId && incomingChatId !== expectedChatId) {
    console.warn(`[tg-webhook] unauthorized chat_id=${incomingChatId}`);
    return ok();
  }

  const text = msg.text.trim();
  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@[a-z0-9_]+$/i, "");

  if (cmd === "/health" || cmd === "/check") {
    await sendTelegram("🔄 health-check 실행 중... (최대 60초)", { parseMode: "Markdown" });
    try {
      const findings = await runHealthChecks();
      // DB 저장
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
        await prisma.healthCheck.create({
          data: { severity: "OK", category: "health-check", key: "summary", message: "정상 — 17개 체크 모두 통과" },
        });
      }
      const high = findings.filter((f) => f.severity === "HIGH");
      const med = findings.filter((f) => f.severity === "MED");
      const low = findings.filter((f) => f.severity === "LOW");
      const lines: string[] = [];
      lines.push(`*Scorebase Health* — ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);
      lines.push(`🚨 HIGH ${high.length} · ⚠️ MED ${med.length} · ℹ️ LOW ${low.length}`);
      if (findings.length === 0) {
        lines.push("");
        lines.push("✅ 17개 체크 모두 통과");
      } else {
        lines.push("");
        for (const f of [...high, ...med, ...low].slice(0, 15)) {
          const e = SEVERITY_EMOJI[f.severity] ?? "•";
          const msgEsc = f.message.replace(/[*_`]/g, "\\$&");
          lines.push(`${e} *${f.category}* / ${f.key}\n${msgEsc}`);
        }
        if (findings.length > 15) lines.push(`\n…외 ${findings.length - 15}건. /admin/health 참조.`);
      }
      await sendTelegram(lines.join("\n\n"), { parseMode: "Markdown" });
    } catch (e) {
      await sendTelegram(`❌ health-check 실패: ${(e as Error).message}`, { parseMode: "Markdown" });
    }
    return ok();
  }

  if (cmd === "/status") {
    const last = await prisma.healthCheck.findFirst({
      orderBy: { runAt: "desc" },
      select: { runAt: true },
    });
    if (!last) {
      await sendTelegram("⚠️ 아직 실행된 health-check 가 없음. `/health` 로 즉시 실행.", { parseMode: "Markdown" });
      return ok();
    }
    const since = last.runAt;
    const recent = await prisma.healthCheck.findMany({
      where: { runAt: { gte: new Date(since.getTime() - 60_000) } },
      orderBy: { severity: "asc" },
    });
    const high = recent.filter((r) => r.severity === "HIGH").length;
    const med = recent.filter((r) => r.severity === "MED").length;
    const low = recent.filter((r) => r.severity === "LOW").length;
    const okCount = recent.filter((r) => r.severity === "OK").length;
    const ago = Math.floor((Date.now() - since.getTime()) / 60_000);
    await sendTelegram(
      `*Scorebase Health — 마지막 실행*\n${since.toISOString().slice(0, 16).replace("T", " ")} UTC (${ago}분 전)\n\n🚨 HIGH ${high} · ⚠️ MED ${med} · ℹ️ LOW ${low}${okCount > 0 ? " · ✅ OK" : ""}`,
      { parseMode: "Markdown" },
    );
    return ok();
  }

  if (cmd === "/help" || cmd === "/start") {
    await sendTelegram(
      `*Scorebase Health Bot*\n\n` +
        `/health 또는 /check — 즉시 17개 체크 실행 + 결과\n` +
        `/status — 마지막 체크 요약\n` +
        `/help — 이 메시지\n\n` +
        `Daily cron: 매일 06:30 KST 자동 실행 (HIGH 발견 시 알림)`,
      { parseMode: "Markdown" },
    );
    return ok();
  }

  // 알려지지 않은 명령
  if (text.startsWith("/")) {
    await sendTelegram(`알 수 없는 명령: \`${text.slice(0, 30)}\`\n/help 참조.`, { parseMode: "Markdown" });
  }
  return ok();
}

// GET — 등록 검증용
export function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST only — Telegram webhook endpoint. Use /api/telegram/webhook with X-Telegram-Bot-Api-Secret-Token header.",
  });
}
