// 사용자 알림 봇 웹훅 — 회원 계정 ↔ 텔레그램 chat_id 연결 (docs/telegram-alerts).
// 운영자 health 봇(/api/telegram/webhook, 단일 chat 화이트리스트)과 별개 봇(USER_BOT_TOKEN).
//
// 보안: USER_BOT_WEBHOOK_SECRET 헤더 검증(fail-closed). chat 화이트리스트는 없음(대중 사용자).
// 등록: curl "https://api.telegram.org/bot$USER_BOT_TOKEN/setWebhook" \
//   -d url=https://www.scorebase.kr/api/telegram/user-webhook \
//   -d secret_token=$USER_BOT_WEBHOOK_SECRET
//
// 명령: /start <token>(연결) · /stop·/unlink(해제) · /help
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegramTo } from "@/lib/notify/telegram";

export const dynamic = "force-dynamic";

interface TgUpdate {
  message?: {
    chat?: { id: number; type: string };
    from?: { id: number; first_name?: string; username?: string };
    text?: string;
  };
}

function ok() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const secret = process.env.USER_BOT_WEBHOOK_SECRET;
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || got !== secret) {
    return NextResponse.json({ error: "bad secret" }, { status: 403 });
  }

  let body: TgUpdate;
  try {
    body = (await req.json()) as TgUpdate;
  } catch {
    return ok();
  }
  const msg = body.message;
  const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
  const text = msg?.text?.trim() ?? "";
  if (!chatId || !text) return ok();

  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase().replace(/@[a-z0-9_]+$/i, "");
  const arg = parts[1]?.trim();

  if (cmd === "/start") {
    if (!arg) {
      await sendTelegramTo(
        chatId,
        "스코어베이스 경기 알림 봇입니다.\n웹사이트에서 <b>텔레그램 연결</b> 버튼을 눌러 시작하세요.",
      );
      return ok();
    }
    const user = await prisma.user.findUnique({ where: { telegramLinkToken: arg } });
    if (!user) {
      await sendTelegramTo(
        chatId,
        "연결 링크가 만료됐거나 올바르지 않습니다. 웹사이트에서 다시 시도해 주세요.",
      );
      return ok();
    }
    // 같은 chat_id 를 쓰던 다른 계정 정리 → 재연결 허용
    await prisma.user.updateMany({
      where: { telegramChatId: chatId, id: { not: user.id } },
      data: { telegramChatId: null },
    });
    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkToken: null },
    });
    await sendTelegramTo(
      chatId,
      `연결 완료 ✅\n<b>${user.nickname}</b>님, 즐겨찾기 팀 경기 알림을 여기로 보내드립니다.\n\n팀 설정·해제는 웹사이트에서. 알림 끄기는 /stop.`,
    );
    return ok();
  }

  if (cmd === "/stop" || cmd === "/unlink") {
    await prisma.user.updateMany({
      where: { telegramChatId: chatId },
      data: { telegramChatId: null },
    });
    await sendTelegramTo(chatId, "알림을 해제했습니다. 다시 받으려면 웹사이트에서 연결해 주세요.");
    return ok();
  }

  if (cmd === "/help") {
    await sendTelegramTo(
      chatId,
      "스코어베이스 경기 알림 봇\n\n/stop — 알림 해제\n연결·즐겨찾기 팀 설정은 웹사이트에서 합니다.",
    );
    return ok();
  }

  if (text.startsWith("/")) {
    await sendTelegramTo(chatId, "알 수 없는 명령입니다. /help 를 참고하세요.");
  }
  return ok();
}

export function GET() {
  return NextResponse.json({ ok: true, info: "POST only — user alert bot webhook." });
}
