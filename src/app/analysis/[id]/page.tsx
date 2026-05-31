import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { gradeByLevel } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, kickoffLabel, hitRate } from "@/lib/analysis/format";
import { toKoreanTeamName } from "@/lib/team-names";
import Markdown from "@/components/Markdown";
import LikeButton from "./LikeButton";
import CommentForm from "./CommentForm";
import { DeletePostButton, DeleteCommentButton } from "./DeleteButtons";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const MARKET_LABEL: Record<string, string> = {
  "1X2": "승무패",
  HANDICAP: "핸디캡",
  OU: "오버언더",
};
const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

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
      commentCount: true,
      pick: true,
      market: true,
      line: true,
      isCorrect: true,
      createdAt: true,
      authorId: true,
      author: {
        select: {
          nickname: true,
          level: true,
          predTotal: true,
          predHit: true,
          predStreak: true,
          predBest: true,
        },
      },
      match: {
        select: {
          league: true,
          status: true,
          startTime: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          authorId: true,
          author: { select: { nickname: true, level: true } },
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
  const isAuthor = userId === post.authorId;
  const g = gradeByLevel(post.author.level);
  const a = post.author;

  const home = post.match ? toKoreanTeamName(post.match.homeTeam.name, post.match.league) : "";
  const away = post.match ? toKoreanTeamName(post.match.awayTeam.name, post.match.league) : "";

  let pickLabel = "";
  if (post.pick && post.match) {
    if (post.market === "HANDICAP" && post.line != null) {
      pickLabel =
        post.pick === "HOME" ? `${home} ${fmtLine(post.line)}` : `${away} ${fmtLine(-post.line)}`;
    } else if (post.market === "OU" && post.line != null) {
      pickLabel = post.pick === "OVER" ? `오버 ${post.line}` : `언더 ${post.line}`;
    } else {
      pickLabel =
        post.pick === "HOME" ? `${home} 승` : post.pick === "AWAY" ? `${away} 승` : "무승부";
    }
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
            {g.emoji} {a.nickname}
          </span>
          {a.predTotal > 0 && (
            <span
              className="font-semibold text-emerald-600 dark:text-emerald-400"
              title={`예측 적중률 ${hitRate(a.predHit, a.predTotal)}% · 최고 ${a.predBest}연승`}
            >
              🎯 {hitRate(a.predHit, a.predTotal)}% ({a.predHit}/{a.predTotal})
              {a.predStreak >= 2 && ` · 🔥${a.predStreak}연승`}
            </span>
          )}
          <span>·</span>
          <span>{listTime(post.createdAt)}</span>
          <span>·</span>
          <span>조회 {post.views}</span>
          <span>·</span>
          <span>추천 {post.likes}</span>
          <span>·</span>
          <span>댓글 {post.commentCount}</span>
          {isAuthor && (
            <>
              <span>·</span>
              <DeletePostButton postId={post.id} />
            </>
          )}
        </div>

        {/* 예측 카드 */}
        {post.pick && post.match && (
          <div className="mt-5 rounded-2xl border border-neutral-200/80 dark:border-neutral-800/80 p-5 bg-neutral-50 dark:bg-neutral-900/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-neutral-500">
                🎯 예측 · {MARKET_LABEL[post.market ?? "1X2"] ?? "승무패"}
              </span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${resultBadge.c}`}>
                {resultBadge.t}
              </span>
            </div>
            <div className="text-sm">
              <span className="font-semibold">
                {home} vs {away}
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

        {/* 본문 (Markdown) */}
        <div className="mt-6">
          <Markdown disableAutoLink>{post.content}</Markdown>
        </div>

        {/* 추천 */}
        <div className="mt-8 flex justify-center">
          <LikeButton
            postId={post.id}
            likes={post.likes}
            disabled={!userId || isAuthor}
          />
        </div>
      </article>

      {/* 댓글 */}
      <section className="mt-12 border-t border-neutral-200 dark:border-neutral-800 pt-6">
        <h2 className="text-sm font-bold mb-4">댓글 {post.commentCount}</h2>

        {post.comments.length > 0 && (
          <ul className="space-y-4 mb-5">
            {post.comments.map((c) => {
              const cg = gradeByLevel(c.author.level);
              return (
                <li key={c.id} className="text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="font-semibold text-neutral-700 dark:text-neutral-300"
                      title={cg.name}
                    >
                      {cg.emoji} {c.author.nickname}
                    </span>
                    <span className="text-xs text-neutral-400">{listTime(c.createdAt)}</span>
                    {userId === c.authorId && <DeleteCommentButton commentId={c.id} />}
                  </div>
                  <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 leading-relaxed">
                    {c.content}
                  </p>
                </li>
              );
            })}
          </ul>
        )}

        {userId ? (
          <CommentForm postId={post.id} />
        ) : (
          <p className="text-sm text-neutral-500">
            댓글은{" "}
            <Link
              href={`/login?from=/analysis/${post.id}`}
              className="text-blue-600 dark:text-blue-400 underline"
            >
              로그인
            </Link>{" "}
            후 작성할 수 있어요.
          </p>
        )}
      </section>
    </main>
  );
}
