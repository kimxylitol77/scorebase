// 클라이언트 런타임 에러 보고 비콘 — error.tsx 가 호출, 텔레그램으로 운영자 알림.
// 스팸 방어: IP 별 + 전역 rate limit. 인증 없음(비콘 특성) — 내용도 경로·메시지뿐이라 민감정보 없음.
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { sendTelegram } from "@/lib/notify/telegram";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const perIp = rateLimit(`error-report:${ip}`, { max: 3, windowMs: 60_000 });
  const global = rateLimit("error-report:global", { max: 10, windowMs: 600_000 });
  if (!perIp.allowed || !global.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let message = "", digest = "", path = "";
  try {
    const j = JSON.parse(await req.text());
    message = String(j?.message ?? "").slice(0, 300);
    digest = String(j?.digest ?? "").slice(0, 60);
    path = String(j?.path ?? "").slice(0, 200);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await sendTelegram(
    [
      "🔥 <b>클라이언트 런타임 에러</b>",
      `📍 ${path || "(경로 미상)"}`,
      digest ? `digest: <code>${digest}</code>` : null,
      message ? `msg: ${message.replace(/</g, "&lt;")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return NextResponse.json({ ok: true });
}
