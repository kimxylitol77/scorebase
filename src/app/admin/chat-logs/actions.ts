"use server";
// 챗봇 규칙 승인·거절·끄기 — 승인(ACTIVE) 즉시 챗봇 시스템 프롬프트 캐시를 비워 다음 대화부터 반영한다.
import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { prisma } from "@/lib/db";
import { CHATBOT_RULES_TAG } from "@/lib/chatbot/rules";

const NEXT: Record<string, string> = { approve: "ACTIVE", reject: "REJECTED", off: "OFF" };

export async function decideChatRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const status = NEXT[String(formData.get("action"))];
  if (!Number.isInteger(id) || !status) return;
  // 승인 전 문구 다듬기 — 관리자가 고친 문구가 있으면 그걸로 저장(200자 제한은 채점기와 같다)
  const edited = String(formData.get("text") ?? "").trim();
  await prisma.chatbotRule.update({
    where: { id },
    data: { status, decidedAt: new Date(), ...(status === "ACTIVE" && edited ? { text: edited.slice(0, 200) } : {}) },
  });
  updateTag(CHATBOT_RULES_TAG);
  revalidatePath("/admin/chat-logs");
}
