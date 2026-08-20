// 경기 분석 챗봇 API — 특정 경기의 브리핑을 미리 주입하고(tool-use 없이) Claude 로 답변.
// matchId 가 이미 확정이라 매치 "검색" tool 이 불필요 → 왕복 없이 더 싸고 빠름.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claude";
import { trackLlmUsage } from "@/lib/ai/usage-track";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUserId } from "@/lib/current-user";
import { buildMatchBrief } from "@/lib/chatbot/match-brief";
import { MATCH_CHAT_SYSTEM } from "@/prompts/match-chat-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 16; // 클라이언트 히스토리 상한
const MAX_USER_LEN = 500;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

function getClientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
  );
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const h = await headers();
  const ip = getClientIp(h);
  // 비용 방어 — ip 당 5분 10회
  const limit = rateLimit(`match-chat:${ip}`, { max: 10, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `질문이 너무 많습니다. ${limit.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429 },
    );
  }

  // 회원 게이트 (2026-08-12) — 실험 단계라 과금 노출면을 로그인 회원으로 좁힌다.
  // UI 숨김만으로는 방어가 안 된다(엔드포인트는 그대로 공개) — 진짜 게이트는 여기다.
  // route 는 force-dynamic 이라 cookies() 를 읽어도 ISR 에 영향 없음.
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: "로그인한 회원만 이용할 수 있습니다." },
      { status: 401 },
    );
  }

  let body: { matchId?: number; messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청." }, { status: 400 });
  }

  const matchId = Number(body.matchId);
  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "matchId 가 필요합니다." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages 가 비어 있음." }, { status: 400 });
  }
  if (incoming.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "대화가 너무 깁니다." }, { status: 400 });
  }

  const brief = await buildMatchBrief(matchId);
  if (!brief) {
    return NextResponse.json({ error: "경기를 찾을 수 없습니다." }, { status: 404 });
  }

  const messages: Anthropic.MessageParam[] = incoming.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content.slice(0, MAX_USER_LEN) : "",
  }));

  try {
    // temperature 미전송 — Claude 5/Opus 계열 override 시 400 회피(claude.ts 주석 참고), 사실 기반 답변엔 불필요.
    const response = await claude.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 700,
      system: [
        { type: "text", text: MATCH_CHAT_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `## 이 경기 데이터\n${brief.text}` },
      ],
      messages,
    });

    // 계측 — 이 라우트는 generate() 를 안 거치고 SDK 를 직접 부르므로 여기서 직접 기록한다.
    // 캐시 읽기·생성분도 입력 토큰에 더한다(system 을 ephemeral 캐시로 태워 보내므로).
    const u = response.usage;
    await trackLlmUsage(
      response.model,
      u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      u.output_tokens,
      "match-chat",
    );

    const reply = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return NextResponse.json({
      reply: reply || "답변을 생성하지 못했습니다.",
      usage: response.usage,
    });
  } catch (err) {
    console.error("[match-chat]", err);
    return NextResponse.json(
      { error: "일시적인 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
