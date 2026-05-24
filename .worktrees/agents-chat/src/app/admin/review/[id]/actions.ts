"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function approveAndPublish(formData: FormData) {
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!id || !title || !content) {
    throw new Error("필수 값이 누락되었습니다.");
  }

  await prisma.article.update({
    where: { id },
    data: {
      title,
      content,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath(`/articles/${id}`);
  redirect("/admin");
}

export async function reject(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("ID 누락");

  await prisma.article.update({
    where: { id },
    data: { status: "REJECTED" },
  });

  revalidatePath("/admin");
  redirect("/admin");
}

export async function saveDraft(formData: FormData) {
  const id = Number(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!id || !title || !content) {
    throw new Error("필수 값이 누락되었습니다.");
  }

  await prisma.article.update({
    where: { id },
    data: { title, content },
  });

  revalidatePath(`/admin/review/${id}`);
}
