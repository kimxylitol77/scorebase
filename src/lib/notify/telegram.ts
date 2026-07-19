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

// 사용자 대면 알림 봇 (USER_BOT_TOKEN) — 회원 개인 chat_id 로 발송.
// 운영자 알림(sendTelegram, TELEGRAM_BOT_TOKEN)과 분리된 별도 봇.
// 반환: 성공 여부(디스패처가 발송 로그 기록 판단에 사용).
export async function sendTelegramTo(
  chatId: string,
  text: string,
  opts: SendOptions = {},
): Promise<boolean> {
  const token = process.env.USER_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] USER_BOT_TOKEN 미설정 — 사용자 알림을 건너뜁니다.");
    return false;
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
    return true;
  } catch (err) {
    console.error("[telegram] 사용자 알림 전송 실패:", err);
    return false;
  }
}

// 사용자 대면 봇(USER_BOT_TOKEN)으로 임의 chat(공개 채널 포함)에 사진+캡션 전송.
// sendTelegramTo 와 동일 패턴 — 반환: 성공 여부(발송 로그 기록 판단에 사용).
export async function sendTelegramPhotoTo(
  chatId: string,
  photoUrl: string,
  caption: string,
): Promise<boolean> {
  const token = process.env.USER_BOT_TOKEN;
  if (!token) {
    console.warn("[telegram] USER_BOT_TOKEN 미설정 — 사진 전송을 건너뜁니다.");
    return false;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      { chat_id: chatId, photo: photoUrl, caption },
      { timeout: 15000 },
    );
    return true;
  } catch (err) {
    console.error("[telegram] 사진 전송 실패:", (err as Error).message);
    return false;
  }
}

/**
 * 이미지(공개 URL) + 캡션을 텔레그램으로 전송. SNS(인스타·스레드) 수동 게시용 카드 배달.
 */
export async function sendTelegramPhoto(
  photoUrl: string,
  caption: string,
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("[telegram] 토큰/chatId 미설정 — 사진 전송 건너뜀");
    return;
  }
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendPhoto`,
      { chat_id: chatId, photo: photoUrl, caption },
      { timeout: 15000 },
    );
  } catch (err) {
    console.error("[telegram] 사진 전송 실패:", (err as Error).message);
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
