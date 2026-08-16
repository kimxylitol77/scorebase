// 클라이언트 런타임 에러 보고 비콘 — error.tsx 가 호출, 텔레그램으로 운영자 알림.
// 스팸 방어: IP 별 + 전역 rate limit. 인증 없음(비콘 특성) — 내용도 경로·메시지뿐이라 민감정보 없음.
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { sendTelegram } from "@/lib/notify/telegram";

export async function POST(req: NextRequest) {
  // 로컬 dev·worktree 서버는 .env.local 공유로 텔레그램 발송이 가능해
  // production 사고처럼 보이는 오알림이 온다 — 운영 도메인 요청만 발송.
  const host = req.headers.get("host") ?? "";
  if (!host.endsWith("scorebase.kr")) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const perIp = rateLimit(`error-report:${ip}`, { max: 3, windowMs: 60_000 });
  const global = rateLimit("error-report:global", { max: 10, windowMs: 600_000 });
  if (!perIp.allowed || !global.allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let message = "", digest = "", path = "", kind = "";
  try {
    const j = JSON.parse(await req.text());
    message = String(j?.message ?? "").slice(0, 300);
    digest = String(j?.digest ?? "").slice(0, 60);
    path = String(j?.path ?? "").slice(0, 200);
    kind = String(j?.kind ?? "").slice(0, 20);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  await sendTelegram(
    [
      // layout = PitchSentinel 등 레이아웃 이탈 감지 — 런타임 에러와 원인 계열이 달라 제목 분리
      kind === "layout" ? "📐 <b>레이아웃 깨짐 감지</b>" : "🔥 <b>클라이언트 런타임 에러</b>",
      `📍 ${path || "(경로 미상)"}`,
      digest ? `digest: <code>${digest}</code>` : null,
      message ? `msg: ${message.replace(/</g, "&lt;")}` : null,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return NextResponse.json({ ok: true });
}
