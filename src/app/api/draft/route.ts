// POST /api/draft — 농구 블라인드 드래프트 진행 (비회원은 draft_sid 쿠키, 회원은 user_session)
//   body { action: "start"|"resume", mode } | { action: "pick"|"spy", gameId, cardId }
//        | { action: "next"|"claim", gameId } | { action: "lifeline", gameId, kind, pos? }
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/current-user";
import { DraftError, type Lifeline } from "@/lib/draft/engine";
import { isDraftMode } from "@/lib/draft/modes";
import { availableModes } from "@/lib/draft/pool";
import { actDraft, claimDraft, resumeDraft, startDraft, type Actor } from "@/lib/draft/service";
import type { Pos } from "@/lib/draft/types";

export const dynamic = "force-dynamic";
const SID_COOKIE = "draft_sid";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
  }
  const jar = await cookies();
  const existing = jar.get(SID_COOKIE)?.value;
  const sessionId = existing && existing.length <= 64 ? existing : crypto.randomUUID();
  const user = await getCurrentUser();
  const actor: Actor = { sessionId, userId: user?.id ?? null, nickname: user?.nickname ?? null };
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");

  try {
    let payload: unknown;
    switch (body.action) {
      case "start":
      case "resume": {
        if (!isDraftMode(body.mode) || !availableModes().includes(body.mode)) return NextResponse.json({ error: "없는 모드입니다" }, { status: 400 });
        const view = body.action === "start" ? await startDraft(body.mode, actor) : await resumeDraft(body.mode, sessionId);
        payload = { view };
        break;
      }
      case "pick":
      case "spy":
        payload = { view: await actDraft(str("gameId"), actor, { action: body.action, cardId: str("cardId") }) };
        break;
      case "next":
        payload = { view: await actDraft(str("gameId"), actor, { action: "next" }) };
        break;
      case "lifeline": {
        const pos: Pos | undefined = str("pos") || undefined; // 유효성은 엔진이 모드 슬롯으로 검사
        payload = { view: await actDraft(str("gameId"), actor, { action: "lifeline", kind: str("kind") as Lifeline, pos }) };
        break;
      }
      case "claim":
        payload = { claimed: await claimDraft(str("gameId"), actor) };
        break;
      default:
        return NextResponse.json({ error: "없는 동작입니다" }, { status: 400 });
    }
    const res = NextResponse.json(payload);
    if (!existing) {
      res.cookies.set(SID_COOKIE, sessionId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 3600, path: "/" });
    }
    return res;
  } catch (e) {
    if (e instanceof DraftError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[draft]", e);
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요" }, { status: 500 });
  }
}
