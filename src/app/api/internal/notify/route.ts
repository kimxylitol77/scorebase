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
import { sendSlack } from "@/lib/notify/slack";
import { prisma } from "@/lib/db";

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

// ── 텔레그램 소음 게이트 (2026-07-19) ──
// 운영 알림은 CRIT/HIGH 만 텔레그램 즉시 push. WARN/INFO 는 HealthCheck 테이블
// 아카이브만 (/admin/health 에서 확인) — 사용자가 전 알림을 눈으로 거르던 부담 제거.
// 예외: 브리핑류(SLACK_CHANNEL_BY_SOURCE 매핑)와 아래 화이트리스트는 등급 무관 현행 유지.
const TELEGRAM_ALWAYS_SOURCES = new Set([
  "mac-mini-ai-company", // AI 회사 주간 회의 결론 — 사용자 구독 리포트 성격
]);

// notify severity → HealthCheck severity 매핑 (대시보드 아카이브용)
const HC_SEVERITY: Record<string, string> = {
  CRIT: "HIGH",
  HIGH: "HIGH",
  WARN: "MED",
  INFO: "LOW",
};

// 브리핑 소스 → 슬랙 채널 아카이빙. 여기 매핑된 source 만 슬랙에도 전송(나머지는 텔레그램만).
const SLACK_CHANNEL_BY_SOURCE: Record<string, string> = {
  "sports-news-brief": process.env.SLACK_CHANNEL_NEWS || "C0BAB424EG5", // #뉴스
  "competitor-watch": process.env.SLACK_CHANNEL_COMPETITOR || "C0BAB4257UM", // #경쟁사
  "competitor-scout": process.env.SLACK_CHANNEL_COMPETITOR || "C0BAB4257UM", // #경쟁사
  "crypto-brief": process.env.SLACK_CHANNEL_CRYPTO || "C0B9Z7FBR3R", // #코인ai
  "ai-news-brief": process.env.SLACK_CHANNEL_AINEWS || "C0BAB9V9X53", // #ai-뉴스
};

// 텔레그램용으로 HTML 이스케이프된 본문을 슬랙용으로 되돌림.
function unescapeHtml(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

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
  if (!body.source || !body.severity || !body.title) {
    return NextResponse.json(
      { error: "source/severity/title required" },
      { status: 400 },
    );
  }
  // message 옵션 — 5요소 (what/when/impact/cause/action) 중 하나라도 있으면 OK
  const hasAny =
    body.message ||
    body.what ||
    body.when ||
    body.impact ||
    body.cause ||
    body.action;
  if (!hasAny) {
    return NextResponse.json(
      { error: "message or what/when/impact/cause/action required" },
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

  // ── 전 등급 HealthCheck 아카이브 — /admin/health 단일 이력. 실패해도 발송은 막지 않음.
  try {
    await prisma.healthCheck.create({
      data: {
        severity: HC_SEVERITY[body.severity] ?? "LOW",
        category: `notify:${body.source}`,
        key: body.title.slice(0, 120),
        message: [body.what, body.impact, body.cause, body.message]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 500) || body.title,
        metadata: { severity: body.severity, ...(body.metadata ?? {}) },
      },
    });
  } catch {}

  // ── 텔레그램은 치명 등급(CRIT/HIGH)·브리핑류·화이트리스트만 — 나머지는 아카이브로 충분.
  const isBrief = !!SLACK_CHANNEL_BY_SOURCE[body.source];
  const pushTelegram =
    body.severity === "CRIT" ||
    body.severity === "HIGH" ||
    isBrief ||
    TELEGRAM_ALWAYS_SOURCES.has(body.source);
  if (pushTelegram) await sendTelegram(lines.join("\n"));

  // 브리핑 소스는 슬랙 채널에도 아카이빙 (검색·보존). SLACK_BOT_TOKEN 있을 때만 실제 전송.
  const slackChannel = SLACK_CHANNEL_BY_SOURCE[body.source];
  if (slackChannel) {
    const slackParts = [`*${body.title}*`];
    if (body.message) slackParts.push(unescapeHtml(body.message));
    await sendSlack(slackChannel, slackParts.join("\n\n"));
  }

  return NextResponse.json({ ok: true });
}
