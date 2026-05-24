"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ===== 검수/수정/승인/거절/저장 (기존 review 페이지에서 사용) =====

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
  revalidatePath("/admin/articles");
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
  revalidatePath("/admin/articles");
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

// ===== 추가 액션 =====

/** 글 영구 삭제 */
export async function deleteArticle(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("ID 누락");

  const a = await prisma.article.findUnique({
    where: { id },
    select: { slug: true },
  });

  await prisma.article.delete({ where: { id } });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/articles");
  if (a?.slug) revalidatePath(`/articles/${a.slug}`);

  // 삭제 후 어디로 갈지: review 페이지에서 호출 시 admin 으로
  const from = String(formData.get("from") ?? "");
  if (from === "review") redirect("/admin/articles");
}

/** 발행 취소 (PUBLISHED → DRAFT) */
export async function unpublish(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("ID 누락");
  await prisma.article.update({
    where: { id },
    data: { status: "DRAFT", publishedAt: null },
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/articles");
}

/** 즉시 발행 (DRAFT/PENDING_REVIEW → PUBLISHED) */
export async function publish(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) throw new Error("ID 누락");
  await prisma.article.update({
    where: { id },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/articles");
}

// ===== 새 글 직접 작성 =====

interface CreateArticleResult {
  ok: boolean;
  error?: string;
  redirectTo?: string;
}

export async function createArticle(
  _prevState: CreateArticleResult,
  formData: FormData,
): Promise<CreateArticleResult> {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const league = String(formData.get("league") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const matchIdRaw = String(formData.get("matchId") ?? "").trim();
  const action = String(formData.get("action") ?? "draft"); // 'draft' | 'publish'

  if (!title) return { ok: false, error: "제목을 입력해주세요." };
  if (!content) return { ok: false, error: "본문을 입력해주세요." };
  if (!["EPL", "NBA", "KBO"].includes(league))
    return { ok: false, error: "리그를 선택해주세요." };
  if (!["PREVIEW", "RECAP", "ANALYSIS"].includes(type))
    return { ok: false, error: "타입을 선택해주세요." };

  let matchId: number | null = null;
  if (matchIdRaw) {
    const n = Number(matchIdRaw);
    if (!Number.isFinite(n)) {
      return { ok: false, error: "matchId 가 숫자가 아닙니다." };
    }
    const found = await prisma.match.findUnique({ where: { id: n } });
    if (!found)
      return { ok: false, error: `match #${n} 을 찾을 수 없습니다.` };
    matchId = n;
  }

  // ID 기반 안전한 slug 만들기 (트랜잭션)
  const status = action === "publish" ? "PUBLISHED" : "DRAFT";
  const tempSlug = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const created = await prisma.article.create({
    data: {
      title,
      content,
      league,
      type,
      matchId,
      slug: tempSlug,
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
    },
  });

  const finalSlug = `${league.toLowerCase()}-${type.toLowerCase()}-${created.id}`;
  await prisma.article.update({
    where: { id: created.id },
    data: { slug: finalSlug },
  });

  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/articles");

  return {
    ok: true,
    redirectTo:
      status === "PUBLISHED" ? `/articles/${finalSlug}` : `/admin/review/${created.id}`,
  };
}
