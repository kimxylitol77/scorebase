// POST /api/internal/notify
// Mac mini 모니터링 봇들이 텔레그램 알림 보낼 때 사용하는 통합 endpoint.
// scorebase_health_bot (기존) 재활용.
// Bearer auth: INTERNAL_API_TOKEN.
//
// Body:
//   {
//     source: "endpoint-monitor" | "data-quality" | "log-analyzer" | "api-quota" | ...
//     severity: "INFO" | "WARN" | "HIGH" | "CRIT",
//     title: string,
//     message: string,
//     metadata?: Record<string, unknown>
//   }

import { NextRequest, NextResponse } from "next/server";
import { sendTelegram } from "@/lib/notify/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  source: string;
  severity: "INFO" | "WARN" | "HIGH" | "CRIT";
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  /** 사용자 친화 추가 필드 (옵션) — 사용자가 알아듣기 쉬운 알림 */
  what?: string;          // 📍 무엇이 문제인가
  when?: string;          // ⏰ 언제부터
  impact?: string;        // 💥 사용자/사이트 영향
  cause?: string;         // 🔍 원인
  action?: string;        // ➡️ 다음 확인할 곳
}

const SEV_EMOJI: Record<string, string> = {
  INFO: "ℹ️",
  WARN: "⚠️",
  HIGH: "🚨",
  CRIT: "🔥",
};

const SEV_LABEL_KO: Record<string, string> = {
  INFO: "안내",
  WARN: "주의",
  HIGH: "긴급",
  CRIT: "치명",
};

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
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
  if (!body.source || !body.severity || !body.title || !body.message) {
    return NextResponse.json(
      { error: "source/severity/title/message required" },
      { status: 400 },
    );
  }

  const emoji = SEV_EMOJI[body.severity] ?? "ℹ️";
  const sevKo = SEV_LABEL_KO[body.severity] ?? body.severity;

  // ── 사용자 친화 메시지 빌더 ──
  // 가능하면 what/when/impact/cause/action 5요소로 구성
  // 폴백: 기존 message 그대로
  const lines: string[] = [`${emoji} <b>${body.title}</b>`];

  // what/when/impact/cause/action 중 하나라도 있으면 구조화
  const hasStructured =
    body.what || body.when || body.impact || body.cause || body.action;

  if (hasStructured) {
    lines.push("");
    if (body.what) lines.push(`📍 <b>무엇</b>: ${body.what}`);
    if (body.when) lines.push(`⏰ <b>언제</b>: ${body.when}`);
    if (body.impact) lines.push(`💥 <b>영향</b>: ${body.impact}`);
    if (body.cause) lines.push(`🔍 <b>원인</b>: ${body.cause}`);
    if (body.action) {
      lines.push("");
      lines.push(`➡️ <b>확인</b>: ${body.action}`);
    }
    // 부가 설명 message 가 있으면 맨 끝에
    if (body.message && body.message !== body.title) {
      lines.push("");
      lines.push(`<i>${body.message}</i>`);
    }
  } else {
    // 기존 호환 — message 그대로
    lines.push("");
    lines.push(body.message);
  }

  // 출처 (꼬리표) — 디버그 용도, 작게
  lines.push("");
  lines.push(`<code>[${sevKo}] ${body.source}</code>`);

  await sendTelegram(lines.join("\n"));
  return NextResponse.json({ ok: true });
}
