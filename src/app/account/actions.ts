"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { AVATAR_IDS } from "@/lib/avatars";

/** 아바타 프리셋 변경 — 본인만. */
export async function setAvatarAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  const avatarId = String(formData.get("avatarId") ?? "");
  if (!AVATAR_IDS.includes(avatarId)) return;
  await prisma.user.update({
    where: { id: session.userId },
    data: { avatarUrl: avatarId },
  });
  revalidatePath("/account");
}

/** 닉네임 변경 — 본인만. 1~20자(공백 제거). 무효면 무시(client 에서 required·maxLength 1차 방어). */
export async function setNicknameAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (nickname.length < 1 || nickname.length > 20) return;
  await prisma.user.update({
    where: { id: session.userId },
    data: { nickname },
  });
  revalidatePath("/account");
}
