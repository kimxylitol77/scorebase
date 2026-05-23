"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function slugify(s: string): string {
  return (
    s
      .trim()
      .toLowerCase()
      .replace(/[^\w가-힣\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "post"
  );
}

function parseBody(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim() || null;
  const content = String(formData.get("content") ?? "").trim();
  const tags = String(formData.get("tags") ?? "").trim() || null;
  const thumbnailUrl = String(formData.get("thumbnailUrl") ?? "").trim() || null;
  const publishedAtStr = String(formData.get("publishedAt") ?? "").trim();
  return { title, slugInput, excerpt, content, tags, thumbnailUrl, publishedAtStr };
}

export async function createBlog(formData: FormData) {
  const { title, slugInput, excerpt, content, tags, thumbnailUrl, publishedAtStr } =
    parseBody(formData);
  if (!title) throw new Error("제목 필수");
  if (!content) throw new Error("본문 필수");

  const dateOnly = new Date().toISOString().slice(0, 10);
  const slug = slugInput || `${dateOnly}-${slugify(title)}`;
  const publishedAt = publishedAtStr ? new Date(publishedAtStr) : new Date();

  const created = await prisma.blog.create({
    data: { title, slug, excerpt, content, tags, thumbnailUrl, publishedAt },
  });

  revalidatePath("/blog");
  revalidatePath(`/blog/${created.slug}`);
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function updateBlog(formData: FormData) {
  const id = Number(formData.get("id"));
  const { title, slugInput, excerpt, content, tags, thumbnailUrl, publishedAtStr } =
    parseBody(formData);
  if (!id) throw new Error("id 필수");
  if (!title || !slugInput || !content) throw new Error("필수 값 누락");

  const updated = await prisma.blog.update({
    where: { id },
    data: {
      title,
      slug: slugInput,
      excerpt,
      content,
      tags,
      thumbnailUrl,
      ...(publishedAtStr ? { publishedAt: new Date(publishedAtStr) } : {}),
    },
  });

  revalidatePath("/blog");
  revalidatePath(`/blog/${updated.slug}`);
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function deleteBlog(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("id 필수");
  const b = await prisma.blog.delete({ where: { id } });
  revalidatePath("/blog");
  revalidatePath(`/blog/${b.slug}`);
  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}
