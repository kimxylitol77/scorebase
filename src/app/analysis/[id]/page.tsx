import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { gradeByLevel } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, kickoffLabel } from "@/lib/analysis/format";
import LikeButton from "./LikeButton";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PostDetailPage({ params }: Props) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId)) notFound();

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      views: true,
      likes: true,
      pick: true,
      isCorrect: true,
      createdAt: true,
      authorId: true,
      author: { select: { nickname: true, level: true } },
      match: {
        select: {
          status: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (!post) notFound();

  // 조회수 +1
  await prisma.post.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  });

  const userId = await getCurrentUserId();
  const g = gradeByLevel(post.author.level);

  let pickLabel = "";
  if (post.pick && post.match) {
    pickLabel =
      post.pick === "HOME"
        ? `${post.match.homeTeam.name} 승`
        : post.pick === "AWAY"
          ? `${post.match.awayTeam.name} 승`
          : "무승부";
  }

  const resultBadge =
    post.isCorrect === true
      ? { t: "🎯 적중", c: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" }
      : post.isCorrect === false
        ? { t: "❌ 미적중", c: "bg-neutral-500/15 text-neutral-500" }
        : { t: "⏳ 경기 대기", c: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-14">
      <Link
        href="/analysis"
        className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        ← 목록
      </Link>

      <article className="mt-4">
        <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">분석</span>
        <h1 className="text-xl sm:text-2xl font-bold mt-1 leading-snug">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-2 mt-3 pb-4 border-b border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-700 dark:text-neutral-300" title={g.name}>
            {g.emoji} {post.author.nickname}
          </span>
          <span>·</span>
          <span>{listTime(post.createdAt)}</span>
          <span>·</span>
          <span>조회 {post.views}</span>
          <span>·</span>
          <span>추천 {post.likes}</span>
        </div>

        {/* 예측 카드 */}
        {post.pick && post.match && (
          <div className="mt-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 p-5 bg-neutral-50 dark:bg-neutral-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-500">🎯 예측</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${resultBadge.c}`}>
                {resultBadge.t}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">
                {post.match.homeTeam.name} vs {post.match.awayTeam.name}
              </span>
              <span className="text-neutral-500"> · {kickoffLabel(post.match.startTime)}</span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm">
                내 예상:{" "}
                <span className="font-bold text-rose-600 dark:text-rose-400">{pickLabel}</span>
              </span>
              {post.match.status === "FINISHED" && post.match.homeScore != null && (
                <span className="text-xs text-neutral-500">
                  (결과 {post.match.homeScore}:{post.match.awayScore})
                </span>
              )}
            </div>
          </div>
        )}

        {/* 본문 */}
        <div className="mt-6 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
          {post.content}
        </div>

        {/* 추천 */}
        <div className="mt-8 flex justify-center">
          <LikeButton
            postId={post.id}
            likes={post.likes}
            disabled={!userId || post.authorId === userId}
          />
        </div>
      </article>
    </main>
  );
}
