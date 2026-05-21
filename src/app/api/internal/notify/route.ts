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
}

const SEV_EMOJI: Record<string, string> = {
  INFO: "ℹ️",
  WARN: "⚠️",
  HIGH: "🚨",
  CRIT: "🔥",
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
  const lines = [
    `${emoji} <b>${body.title}</b>`,
    ``,
    body.message,
    ``,
    `<code>[${body.severity}] ${body.source}</code>`,
  ];
  if (body.metadata && Object.keys(body.metadata).length > 0) {
    const items = Object.entries(body.metadata)
      .slice(0, 5)
      .map(([k, v]) => `  ${k}: <code>${String(v).slice(0, 80)}</code>`)
      .join("\n");
    lines.push("", items);
  }

  await sendTelegram(lines.join("\n"));
  return NextResponse.json({ ok: true });
}
