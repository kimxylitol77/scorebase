"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const VALID_TYPES = new Set(["CHANGELOG", "NOTICE", "MAINTENANCE"]);

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "notice"
  );
}

export async function createNotice(formData: FormData) {
  const type = String(formData.get("type") ?? "CHANGELOG").toUpperCase();
  const title = String(formData.get("title") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const publishedAtStr = String(formData.get("publishedAt") ?? "").trim();

  if (!VALID_TYPES.has(type)) throw new Error("유효하지 않은 type");
  if (!title) throw new Error("제목 필수");
  if (!content) throw new Error("내용 필수");

  const dateOnly = new Date().toISOString().slice(0, 10);
  const slug = slugInput || `${dateOnly}-${slugify(title)}`;

  const publishedAt = publishedAtStr ? new Date(publishedAtStr) : new Date();

  const created = await prisma.notice.create({
    data: { type, title, slug, content, publishedAt },
  });

  revalidatePath("/notices");
  revalidatePath(`/notices/${created.slug}`);
  revalidatePath("/admin/notices");
  redirect("/admin/notices");
}

export async function updateNotice(formData: FormData) {
  const id = Number(formData.get("id"));
  const type = String(formData.get("type") ?? "").toUpperCase();
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const publishedAtStr = String(formData.get("publishedAt") ?? "").trim();

  if (!id) throw new Error("id 필수");
  if (!VALID_TYPES.has(type)) throw new Error("유효하지 않은 type");
  if (!title || !slug || !content) throw new Error("필수 값 누락");

  const updated = await prisma.notice.update({
    where: { id },
    data: {
      type,
      title,
      slug,
      content,
      ...(publishedAtStr ? { publishedAt: new Date(publishedAtStr) } : {}),
    },
  });

  revalidatePath("/notices");
  revalidatePath(`/notices/${updated.slug}`);
  revalidatePath("/admin/notices");
  redirect("/admin/notices");
}

export async function deleteNotice(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("id 필수");
  const n = await prisma.notice.delete({ where: { id } });
  revalidatePath("/notices");
  revalidatePath(`/notices/${n.slug}`);
  revalidatePath("/admin/notices");
  redirect("/admin/notices");
}
