"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-guard";
import {
  GWAK_DRAFT_CATEGORY,
  GWAK_REJECTED_CATEGORY,
  runGwakDrafts,
} from "@/lib/analysis/gwak-pickster";

function draftId(formData: FormData): number {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) throw new Error("유효하지 않은 초안입니다.");
  return id;
}

function editedCopy(formData: FormData): { title: string; content: string } {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (title.length < 2 || title.length > 120) throw new Error("제목은 2~120자로 입력하세요.");
  if (content.length < 20) throw new Error("본문은 20자 이상 입력하세요.");
  return { title, content };
}

export async function generateGwakDraftsAction(): Promise<void> {
  await requireAdmin();
  const result = await runGwakDrafts(2);
  revalidatePath("/admin/pick-drafts");
  redirect(`/admin/pick-drafts?generated=${result.created}&candidates=${result.candidates}&skipped=${result.skipped}`);
}

export async function saveGwakDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = draftId(formData);
  const copy = editedCopy(formData);
  const updated = await prisma.post.updateMany({
    where: { id, category: GWAK_DRAFT_CATEGORY },
    data: copy,
  });
  if (updated.count !== 1) throw new Error("이미 처리됐거나 존재하지 않는 초안입니다.");
  revalidatePath("/admin/pick-drafts");
  redirect("/admin/pick-drafts?saved=1");
}

export async function publishGwakDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = draftId(formData);
  const copy = editedCopy(formData);
  const draft = await prisma.post.findFirst({
    where: { id, category: GWAK_DRAFT_CATEGORY },
    select: { authorId: true, matchId: true, market: true, match: { select: { status: true, startTime: true } } },
  });
  if (!draft || !draft.matchId || !draft.match) throw new Error("이미 처리됐거나 경기 정보가 없는 초안입니다.");
  if (draft.match.status !== "SCHEDULED" || draft.match.startTime <= new Date()) {
    throw new Error("이미 시작했거나 취소된 경기의 픽은 발행할 수 없습니다.");
  }

  const duplicate = await prisma.post.findFirst({
    where: {
      id: { not: id },
      authorId: draft.authorId,
      matchId: draft.matchId,
      market: draft.market,
      category: "ANALYSIS",
    },
    select: { id: true },
  });
  if (duplicate) throw new Error("같은 경기·마켓의 곽씨 픽이 이미 발행됐습니다.");

  await prisma.post.update({
    where: { id },
    data: { ...copy, category: "ANALYSIS", createdAt: new Date() },
  });
  revalidatePath("/analysis");
  revalidatePath("/admin/pick-drafts");
  redirect(`/analysis/${id}`);
}

export async function rejectGwakDraftAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = draftId(formData);
  const updated = await prisma.post.updateMany({
    where: { id, category: GWAK_DRAFT_CATEGORY },
    data: { category: GWAK_REJECTED_CATEGORY },
  });
  if (updated.count !== 1) throw new Error("이미 처리됐거나 존재하지 않는 초안입니다.");
  revalidatePath("/admin/pick-drafts");
  redirect("/admin/pick-drafts?rejected=1");
}
