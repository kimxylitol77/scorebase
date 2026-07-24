"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { shopItemById } from "@/lib/shop";

export type PurchaseState = { ok?: boolean; error?: string; message?: string } | null;

class InsufficientError extends Error {}

/** 아이템 구매 — 본인만. 포인트 차감 + 인벤토리(UserCosmetic) 기록 + ExpLog 이력 (원자적). */
export async function purchaseCosmeticAction(
  _prev: PurchaseState,
  formData: FormData,
): Promise<PurchaseState> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return { error: "로그인이 필요합니다." };

  const item = shopItemById(String(formData.get("itemId") ?? ""));
  if (!item) return { error: "존재하지 않는 상품입니다." };

  try {
    await prisma.$transaction(async (tx) => {
      const u = await tx.user.findUnique({
        where: { id: session.userId },
        select: { points: true },
      });
      if (!u || u.points < item.price) throw new InsufficientError();
      // 인벤토리 먼저 생성 — 이미 보유하면 unique(userId,itemId) 위반(P2002)으로 롤백.
      await tx.userCosmetic.create({ data: { userId: session.userId, itemId: item.id } });
      await tx.user.update({
        where: { id: session.userId },
        data: { points: { decrement: item.price } },
      });
      await tx.expLog.create({
        data: { userId: session.userId, exp: 0, points: -item.price, reason: "shop_purchase" },
      });
    });
  } catch (e) {
    if (e instanceof InsufficientError) return { error: "포인트가 부족합니다." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "이미 보유한 상품입니다." };
    }
    console.error("[shop-purchase]", e);
    return { error: "구매 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }

  revalidatePath("/account/shop");
  revalidatePath("/account");
  return { ok: true, message: `'${item.name}' 구매 완료! 상점에서 장착할 수 있어요.` };
}

/** 아이템 장착 — 본인만. 보유(UserCosmetic) 확인 후 해당 종류 슬롯(nameColor/avatarFrame)에 세팅. */
export async function equipCosmeticAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;

  const item = shopItemById(String(formData.get("itemId") ?? ""));
  if (!item) return;

  const owned = await prisma.userCosmetic.findUnique({
    where: { userId_itemId: { userId: session.userId, itemId: item.id } },
    select: { id: true },
  });
  if (!owned) return; // 미보유는 장착 불가

  await prisma.user.update({
    where: { id: session.userId },
    data: { [item.type]: item.id },
  });
  revalidatePath("/account/shop");
  revalidatePath("/account");
}

/** 아이템 장착 해제 — 본인만. 종류(type) 슬롯을 비운다. */
export async function unequipCosmeticAction(formData: FormData): Promise<void> {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return;

  const type = String(formData.get("type") ?? "");
  if (type !== "nameColor" && type !== "avatarFrame") return;

  await prisma.user.update({
    where: { id: session.userId },
    data: { [type]: null },
  });
  revalidatePath("/account/shop");
  revalidatePath("/account");
}
