// 사이트 방문자 Q&A 챗봇.
// Claude tool use 로 DB 를 조회해 실시간 데이터로 답변한다.

import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Anthropic from "@anthropic-ai/sdk";
import { claude, CLAUDE_MODEL } from "@/lib/ai/claude";
import { TOOL_DEFS, executeTool } from "@/lib/chatbot/tools";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 20; // 클라이언트 히스토리 상한
const MAX_USER_LEN = 1000;
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = `당신은 Scorebase 사이트의 안내 챗봇입니다.
Scorebase 는 EPL · LALIGA · BUNDESLIGA · SERIE_A · LIGUE_1 · MLS · UCL · FIFA 월드컵 2026 · NBA · NHL · MLB · KBO · NPB · LCK 의 경기 데이터를 분석해 모델 예측(1X2 / DC / OVER·UNDER / 핸디캡 / BTTS) 과 시장 배당 비교를 제공합니다.

답변 원칙:
- 항상 한국어로, 짧고 명확하게.
- 데이터가 필요한 질문은 반드시 도구를 호출해 최신 DB 값으로 답한다. 추측 금지.
- 도구 결과의 [#숫자] 는 매치 ID. 사용자에게 노출할 필요 없음.
- 모델 예측은 참고용이며 베팅 결과를 보장하지 않음을 필요 시 한 줄 안내.
- 데이터가 없으면 "현재 데이터 없음" 이라 솔직히 답한다.
- 사이트에 없는 외부 정보(다른 리그, 실시간 중계, 개인 의견)는 모른다고 답하고 다루는 리그를 안내.
- 답변은 가능한 5문장 이내. 표보다는 짧은 불릿 또는 줄글.
- 사용자가 버그·오류·기능 문제를 제보하면 report_bug 도구로 운영자에게 전달한 뒤 "관리자에게 전달해 드리겠습니다." 라고 답한다.`;

interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

function getClientIp(h: Headers): string {
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: Request) {
  // 과금(Claude) OFF 스위치 — CHATBOT_AI_ENABLED=true 일 때만 AI 응답한다.
  // 기본은 꺼짐: 챗봇 UI 는 뜨지만 Claude 를 호출하지 않아 과금이 없다.
  // 켤 때: Vercel 환경변수에 CHATBOT_AI_ENABLED=true + ANTHROPIC_API_KEY 설정.
  if (process.env.CHATBOT_AI_ENABLED !== "true") {
    return NextResponse.json({
      reply: "챗봇은 곧 정식 오픈 예정이에요. 지금은 준비 중입니다. 조금만 기다려 주세요.",
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY 가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const h = await headers();
  const ip = getClientIp(h);
  const limit = rateLimit(`chat:${ip}`, { max: 15, windowMs: 5 * 60 * 1000 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `요청이 너무 많습니다. ${limit.retryAfterSec}초 후 다시 시도하세요.` },
      { status: 429 },
    );
  }

  let body: { messages?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "messages 가 비어 있음." }, { status: 400 });
  }
  if (incoming.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "대화가 너무 깁니다." }, { status: 400 });
  }

  const messages: Anthropic.MessageParam[] = incoming.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: typeof m.content === "string" ? m.content.slice(0, MAX_USER_LEN) : "",
  }));

  try {
    let iterations = 0;
    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations += 1;
      const response = await claude.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        temperature: 0.4,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOL_DEFS,
        messages,
      });

      // assistant 메시지 누적
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "tool_use") {
        const toolUses = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const t of toolUses) {
          let result: string;
          try {
            result = await executeTool(t.name, t.input as Record<string, unknown>);
          } catch (err) {
            result = `(도구 실행 오류: ${(err as Error).message})`;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: t.id,
            content: result,
          });
        }
        messages.push({ role: "user", content: toolResults });
        continue; // 다음 턴
      }

      // 최종 텍스트 추출
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();

      return NextResponse.json({
        reply: text || "(빈 응답)",
        usage: response.usage,
      });
    }

    return NextResponse.json(
      { reply: "도구 호출 한도를 초과했습니다. 질문을 단순화해 다시 시도해 주세요." },
    );
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: "챗봇 응답 생성 실패." },
      { status: 500 },
    );
  }
}
