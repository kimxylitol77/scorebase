// 관리자가 승인(ACTIVE)한 챗봇 행동 규칙을 시스템 프롬프트 블록으로 만든다 — /api/chat 이 매 요청 붙인다(5분 캐시).
// 규칙은 /api/cron/chat-review 채점기가 제안하고 /admin/chat-logs 에서 승인한다. 배포 없이 챗봇 행동이 바뀐다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

export const CHATBOT_RULES_TAG = "chatbot-rules";
const MAX_ACTIVE = 20;

export const getActiveChatRulesBlock = unstable_cache(
  async (): Promise<string | null> => {
    const rules = await prisma.chatbotRule.findMany({
      where: { status: "ACTIVE" },
      orderBy: { decidedAt: "asc" },
      take: MAX_ACTIVE,
      select: { text: true },
    });
    if (rules.length === 0) return null;
    return `운영자가 대화 점검 후 추가한 규칙(위 규칙과 함께 지킨다):\n${rules.map((r, i) => `${i + 1}. ${r.text}`).join("\n")}`;
  },
  ["chatbot-active-rules"],
  { revalidate: 300, tags: [CHATBOT_RULES_TAG] },
);
