"use server";
// /scores 광고 배너 설정을 저장하는 서버 액션 (관리자 전용, 단일 row upsert)

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";

export async function saveAdBanner(formData: FormData) {
  await requireAdmin();
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const linkUrl = String(formData.get("linkUrl") ?? "").trim();
  const width = Math.max(0, Number(formData.get("width")) || 0);
  const height = Math.max(0, Number(formData.get("height")) || 0);
  const enabled = formData.get("enabled") === "on";

  if (enabled && !imageUrl) {
    throw new Error("표시하려면 이미지 URL 이 필요합니다.");
  }

  await prisma.adBanner.upsert({
    where: { id: 1 },
    create: { id: 1, imageUrl, linkUrl: linkUrl || null, width, height, enabled },
    update: { imageUrl, linkUrl: linkUrl || null, width, height, enabled },
  });

  revalidatePath("/scores");
  revalidatePath("/admin/ad");
  redirect("/admin/ad");
}
