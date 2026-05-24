// /api/admin/agents/chat — 5 페르소나 채팅 endpoint.
// POST { persona, message, sessionId? } → { reply, model, inputTokens, outputTokens }
// admin 세션 쿠키 인증 필수.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PERSONAS, type PersonaKey } from "@/lib/agents/personas";
import { chatWithLLM, type ChatMessage } from "@/lib/agents/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function checkAdmin(): Promise<boolean> {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);
  return !!session;
}

export async function POST(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: { persona?: string; message?: string; sessionId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const personaKey = body.persona as PersonaKey | undefined;
  const message = body.message?.trim();
  const sessionId = body.sessionId?.trim() || "default";

  if (!personaKey || !PERSONAS[personaKey]) {
    return NextResponse.json({ error: "invalid_persona" }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: "empty_message" }, { status: 400 });
  }
  const persona = PERSONAS[personaKey];

  // 최근 20개 메시지 컨텍스트 (오래된 것 → 최신 순)
  const history = await prisma.agentMessage.findMany({
    where: { persona: personaKey, sessionId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { role: true, content: true },
  });
  history.reverse();

  // 사용자 메시지 DB 저장 (응답 받기 전에 — 중간 실패해도 사용자 기록은 남음)
  await prisma.agentMessage.create({
    data: {
      persona: personaKey,
      sessionId,
      role: "user",
      content: message,
    },
  });

  // LLM 호출 메시지 시퀀스 — system + history + new user
  const llmMessages: ChatMessage[] = [
    { role: "system", content: persona.systemPrompt },
    ...history.map((h) => ({ role: h.role as ChatMessage["role"], content: h.content })),
    { role: "user", content: message },
  ];

  try {
    const result = await chatWithLLM(llmMessages);
    // assistant 응답 DB 저장
    await prisma.agentMessage.create({
      data: {
        persona: personaKey,
        sessionId,
        role: "assistant",
        content: result.text,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      },
    });
    return NextResponse.json({
      reply: result.text,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "llm_failed", detail: msg }, { status: 500 });
  }
}
