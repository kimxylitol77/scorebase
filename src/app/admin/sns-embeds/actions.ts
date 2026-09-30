"use server";
// /admin/sns-embeds 서버 액션 — 인증샷 모음에 올릴 SNS 글 등록·숨김·삭제.

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-guard";
import { parseSnsUrl } from "@/lib/sns-embed";

const back = (msg?: string) => redirect(`/admin/sns-embeds${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`);

export async function addSnsEmbed(formData: FormData) {
  await requireAdmin();
  const info = parseSnsUrl(String(formData.get("url") ?? ""));
  const note = String(formData.get("note") ?? "").trim().slice(0, 60) || null;
  if (!info) back("인스타그램·X·Threads 글 주소만 등록할 수 있습니다.");
  else {
    const dup = await prisma.snsEmbed.findUnique({ where: { url: info.url }, select: { id: true } });
    if (dup) back("이미 등록된 글입니다.");
    await prisma.snsEmbed.create({ data: { platform: info.platform, url: info.url, note } });
    revalidatePath("/community/proof");
    back();
  }
}

export async function toggleSnsEmbed(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const row = await prisma.snsEmbed.findUnique({ where: { id }, select: { hidden: true } });
  if (row) await prisma.snsEmbed.update({ where: { id }, data: { hidden: !row.hidden } });
  revalidatePath("/community/proof");
  back();
}

export async function deleteSnsEmbed(formData: FormData) {
  await requireAdmin();
  await prisma.snsEmbed.deleteMany({ where: { id: Number(formData.get("id")) } });
  revalidatePath("/community/proof");
  back();
}
