// 챗봇 대화 자동 점검 cron — 매일 09:00 KST(00:00 UTC). 전날(KST) ChatLog 를 채점해 ChatReview 에 저장하고,
// 반복 실패는 규칙 제안(ChatbotRule PROPOSED)으로 남긴 뒤 텔레그램으로 한 줄 요약을 보낸다.
// ?date=YYYY-MM-DD 특정일 재채점 · ?dry=1 저장·발송 없이 결과만.
import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { recordCronRun } from "@/lib/cron-registry";
import { withLlmTag } from "@/lib/ai/usage-track";
import { reviewChatDay, chatReviewMessage, kstYesterday } from "@/lib/chatbot/review";
import { sendTelegram } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });
  const params = new URL(req.url).searchParams;
  const date = params.get("date");
  const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : kstYesterday();
  const dry = params.get("dry") === "1";
  try {
    const result = await withLlmTag("chat-review", () => reviewChatDay(day, { dry }));
    if (!dry) {
      const site = process.env.SITE_URL ?? "https://www.scorebase.kr";
      await sendTelegram(chatReviewMessage(result, site));
      await recordCronRun("chat-review", { ok: true, count: result.total });
    }
    return NextResponse.json({ ok: true, dry, ...result });
  } catch (e) {
    const msg = (e as Error).message;
    if (!dry) await recordCronRun("chat-review", { ok: false, error: msg });
    return NextResponse.json({ ok: false, day, error: msg }, { status: 500 });
  }
}
