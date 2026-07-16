// 텔레그램 연결 딥링크 발급/해제 (docs/telegram-alerts). 로그인 회원 전용.
// POST   → 링크 토큰 생성·저장 후 t.me 딥링크 반환 (봇 /start <token> 로 연결 완성)
// DELETE → 웹에서 연결 해제 (chat_id·token null)
// GET    → 현재 연결 상태
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

const BOT_USERNAME = process.env.USER_BOT_USERNAME ?? "scorebasetim123_bot";

export async function POST() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const token = randomBytes(16).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkToken: token } });
  return NextResponse.json({ url: `https://t.me/${BOT_USERNAME}?start=${token}` });
}

export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await prisma.user.update({
    where: { id: userId },
    data: { telegramChatId: null, telegramLinkToken: null },
  });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  });
  return NextResponse.json({ connected: !!user?.telegramChatId });
}
