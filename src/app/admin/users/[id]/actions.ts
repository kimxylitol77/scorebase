// 봇 계정 프로필 꾸미기 — 관리자 전용 서버 액션.
// 봇은 포인트를 벌지 않아 상점에서 살 수 없으므로 관리자가 직접 장착시킨다.
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import { isBotAccount } from "@/lib/bot-accounts";
import { shopItemById, type CosmeticType } from "@/lib/shop";
import { AVATAR_IDS } from "@/lib/avatars";

/** 폼 값을 아이템 id 로 정규화 — 빈 문자열은 "해제"(null). 카탈로그에 없는 id 는 거부. */
function pickItem(raw: FormDataEntryValue | null, type: CosmeticType): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  const item = shopItemById(v);
  if (!item || item.type !== type) throw new Error(`알 수 없는 ${type} 아이템: ${v}`);
  return item.id;
}

export async function saveBotCosmetics(formData: FormData) {
  await requireAdmin();

  const userId = String(formData.get("userId") ?? "");
  if (!userId) throw new Error("userId 누락");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new Error("계정을 찾을 수 없습니다");
  // 회원 프로필은 본인 것이다 — 관리자도 바꾸지 않는다. 봇 계정에만 연다.
  if (!isBotAccount(user.email)) throw new Error("봇 계정이 아닙니다 — 회원 프로필은 변경할 수 없습니다");

  const rawAvatar = String(formData.get("avatarUrl") ?? "").trim();
  // 프리셋 id 만 받는다. 업로드 사진(data URL)은 회원이 직접 올린 것이라 여기서 손대지 않는다.
  if (rawAvatar && !AVATAR_IDS.includes(rawAvatar)) throw new Error(`알 수 없는 아바타: ${rawAvatar}`);
  const avatarUrl = rawAvatar || null;

  const nameColor = pickItem(formData.get("nameColor"), "nameColor");
  const avatarFrame = pickItem(formData.get("avatarFrame"), "avatarFrame");
  const title = pickItem(formData.get("title"), "title");

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl, nameColor, avatarFrame, title },
  });

  // 보유 목록도 맞춰 둔다. 지금 렌더는 장착 필드만 보지만, 나중에 보유 검증이 생겨도
  // 봇만 조용히 꾸미기가 벗겨지는 일이 없게 한다.
  const owned = [nameColor, avatarFrame, title].filter((v): v is string => !!v);
  if (owned.length > 0) {
    await prisma.userCosmetic.createMany({
      data: owned.map((itemId) => ({ userId, itemId })),
      skipDuplicates: true,
    });
  }

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}
