import axios from "axios";

// Telegram 검수 알림 모듈
// 사용처: AI 가 글을 생성한 직후 운영자 채팅으로 "검수 요청" 메시지 발송.

interface SendOptions {
  parseMode?: "Markdown" | "HTML";
  disablePreview?: boolean;
}

export async function sendTelegram(
  text: string,
  opts: SendOptions = {},
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID 가 설정되지 않아 알림을 건너뜁니다.",
    );
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: opts.parseMode ?? "HTML",
        disable_web_page_preview: opts.disablePreview ?? true,
      },
      { timeout: 10000 },
    );
  } catch (err) {
    console.error("[telegram] 알림 전송 실패:", err);
  }
}

/**
 * 새 글이 검수 대기 상태가 됐을 때 보내는 알림.
 */
export async function notifyDraftReady(article: {
  id: number;
  title: string;
  league: string;
  type: string;
}) {
  const reviewUrl = `${process.env.SITE_URL ?? "http://localhost:3000"}/admin/review/${article.id}`;
  const text = [
    `📝 <b>새 글 검수 대기</b>`,
    ``,
    `🏷 ${article.league} · ${article.type}`,
    `📰 ${article.title}`,
    ``,
    `🔗 <a href="${reviewUrl}">검수하기</a>`,
  ].join("\n");

  await sendTelegram(text);
}
