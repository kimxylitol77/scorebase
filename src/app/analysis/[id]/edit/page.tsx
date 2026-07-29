// 게시판 글 수정 — 작성자 본인 또는 관리자만. 그 외에는 글로 되돌림.
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { COOKIE_NAME as ADMIN_COOKIE, readSessionCookie } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/current-user";
import { updatePostAction, updatePostAdminAction } from "../../actions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: Props) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) notFound();

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      lineupCode: true,
      authorId: true,
      author: { select: { nickname: true } },
    },
  });
  if (!post) notFound();

  const c = await cookies();
  const isAdmin = !!readSessionCookie(c.get(ADMIN_COOKIE)?.value);
  const userId = await getCurrentUserId();
  const isAuthor = !!userId && userId === post.authorId;
  if (!isAdmin && !isAuthor) redirect(`/analysis/${postId}`);

  const inputCls =
    "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-rose-400 dark:border-neutral-700 dark:bg-white/[0.04]";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-lg font-bold">글 수정{isAuthor ? "" : " (관리자)"}</h1>
        <span className="text-xs text-neutral-500">작성자: {post.author.nickname}</span>
      </div>
      <form action={isAuthor ? updatePostAction : updatePostAdminAction} className="space-y-4">
        <input type="hidden" name="postId" value={post.id} />
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-500">제목</label>
          <input name="title" required minLength={2} maxLength={120} defaultValue={post.title} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-500">본문 (Markdown)</label>
          <textarea name="content" required rows={18} defaultValue={post.content} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-neutral-500">
            전술판 코드 (선택 — /lineup 공유 URL 또는 코드 붙여넣기, 비우면 첨부 제거)
          </label>
          <input name="lineupCode" defaultValue={post.lineupCode ?? ""} className={inputCls} />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
          >
            저장
          </button>
          <Link href={`/analysis/${post.id}`} className="text-sm text-neutral-500 hover:underline">
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
