// 분석 게시판 글 상세 — 픽·근거 본문 + 댓글 + 경기 결과 적중 판정.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { COOKIE_NAME as ADMIN_COOKIE, readSessionCookie } from "@/lib/auth";
import { displayGrade, EXP_REWARDS, POINT_REWARDS } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, kickoffLabel, hitRate } from "@/lib/analysis/format";
import { pickOdds, fmtOdds } from "@/lib/analysis/odds";
import { toKoreanTeamName } from "@/lib/team-names";
import { TIERS } from "@/lib/dream-team/tiers";
import Markdown from "@/components/Markdown";
import UserName from "@/components/UserName";
import TeamBadge from "@/components/TeamBadge";
import { Target } from "lucide-react";
import FollowButton from "@/components/experts/FollowButton";
import LikeButton from "./LikeButton";
import ShareButton from "./ShareButton";
import CommentForm from "./CommentForm";
import { DeletePostButton, AdminDeletePostButton } from "./DeleteButtons";
import CommentItem from "./CommentItem";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ welcome?: string }>;
}

// 봇 자동 발행 + 회원 UGC 가 매일 쌓이는 섹션 — 전 글이 루트 제네릭 타이틀을 공유하며
// 색인 품질 신호를 희석하던 것 수정 (2026-07 감사 D8). 글 제목은 채우되 noindex,follow.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isFinite(postId)) return { title: "글을 찾을 수 없습니다" };
  const post = await prisma.post.findFirst({
    where: { id: postId, category: { in: ["ANALYSIS", "FREE", "BRIEFING", "BRIEFING_LEGACY"] } },
    select: { title: true },
  });
  if (!post) return { title: "글을 찾을 수 없습니다" };
  return { title: post.title, robots: { index: false, follow: true } };
}

const MARKET_LABEL: Record<string, string> = {
  "1X2": "승무패",
  HANDICAP: "핸디캡",
  OU: "오버언더",
};
const fmtLine = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export default async function PostDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { welcome } = await searchParams;
  const postId = Number(id);
  if (!Number.isInteger(postId)) notFound();

  const post = await prisma.post.findFirst({
    where: { id: postId, category: { in: ["ANALYSIS", "FREE", "BRIEFING", "BRIEFING_LEGACY"] } },
    select: {
      id: true,
      title: true,
      content: true,
      category: true,
      dreamTeamId: true,
      lineupCode: true,
      sport: true,
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
          badge: true,
          nameColor: true,
          title: true,
          favoriteTeam: { select: { logoUrl: true } },
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
          oddsHome: true,
          oddsDraw: true,
          oddsAway: true,
          oddsHcHome: true,
          oddsHcAway: true,
          oddsOver: true,
          oddsUnder: true,
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
          author: { select: { nickname: true, level: true, badge: true, nameColor: true, title: true } },
        },
      },
    },
  });
  if (!post) notFound();
  const isFree = post.category === "FREE";

  // 조회수 +1
  await prisma.post.update({
    where: { id: postId },
    data: { views: { increment: 1 } },
  });

  // 자유글 첨부 — 드림팀 (삭제된 팀이면 조용히 생략)
  const dreamTeam = post.dreamTeamId
    ? await prisma.dreamTeam.findUnique({
        where: { id: post.dreamTeamId },
        select: { id: true, name: true, tier: true, rating: true, wins: true, draws: true, losses: true },
      })
    : null;

  const userId = await getCurrentUserId();
  const isAuthor = userId === post.authorId;
  // 작성자 팔로우 여부 — 팔로우 버튼 상태 (비로그인 = 미팔로우 표시, 클릭 시 로그인 유도)
  const isFollowingAuthor = userId
    ? !!(await prisma.userAnalystFollow.findUnique({
        where: { userId_analystId: { userId, analystId: post.authorId } },
        select: { id: true },
      }))
    : false;
  // 관리자 — 게시판 모든 글 수정 버튼 노출 (admin_session HMAC 검증).
  const isAdmin = !!readSessionCookie((await cookies()).get(ADMIN_COOKIE)?.value);
  const g = displayGrade(post.author.level, post.author.badge);
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

  const odds = pickOdds(post.market, post.pick, post.match);

  const resultBadge =
    post.isCorrect === true
      ? {
          t: "✓ 적중",
          c: "bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-yellow-950 font-extrabold shadow-[0_0_12px_rgba(234,179,8,0.6)] ring-1 ring-yellow-300/60",
        }
      : post.isCorrect === false
        ? { t: "❌ 미적중", c: "bg-neutral-500/15 text-neutral-500" }
        : { t: "⏳ 경기 대기", c: "bg-amber-500/15 text-amber-600 dark:text-amber-400" };

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-14">
      {/* 앰비언트 배경 */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
        <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
        <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
      </div>

      <Link
        href={post.category.startsWith("BRIEFING") ? "/news" : isFree ? "/analysis?board=free" : "/analysis"}
        className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3.5 py-1.5 text-sm font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white hover:text-neutral-900 dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10 dark:hover:text-white"
      >
        ← 목록
      </Link>

      {/* 첫 글 축하 배너 — 작성자 본인이 방금 첫 글을 올렸을 때만 (welcome=1 & isAuthor) */}
      {welcome === "1" && isAuthor && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-600 px-5 py-4 text-white shadow-[0_18px_50px_-24px_rgba(225,29,72,0.7)]">
          <div className="text-sm font-bold">🎉 첫 글 등록을 환영합니다!</div>
          <div className="mt-1 text-sm text-white/90">
            첫 글 보너스로 <strong className="tabular-nums">+{(EXP_REWARDS.analysisPost + EXP_REWARDS.firstPostBonus).toLocaleString()} XP</strong>
            {" · "}
            <strong className="tabular-nums">+{POINT_REWARDS.analysisPost + POINT_REWARDS.firstPostBonus} P</strong> 를 받았습니다. 경험치가 쌓이면 등급이 오릅니다.
          </div>
        </div>
      )}

      <article className="mt-5">
        {post.category.startsWith("BRIEFING") ? (
          <span className="inline-flex w-fit rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">해외 브리핑</span>
        ) : isFree ? (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex w-fit rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">자유</span>
            {post.sport === "soccer" && <span className="inline-flex w-fit rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-300">축구</span>}
            {post.sport === "baseball" && <span className="inline-flex w-fit rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-300">야구</span>}
          </span>
        ) : (
          <span className="inline-flex w-fit rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">분석</span>
        )}
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold leading-snug tracking-tight break-keep">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-2 mt-3 pb-4 border-b border-black/5 dark:border-white/10 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1 font-semibold text-neutral-700 dark:text-neutral-300" title={g.name}>
            {g.emoji} <UserName name={a.nickname} nameColor={a.nameColor} title={a.title} />
            <TeamBadge logoUrl={a.favoriteTeam?.logoUrl ?? null} size={16} className="shrink-0 rounded-sm" />
          </span>
          {a.predTotal > 0 ? (
            <span
              className="font-semibold text-emerald-600 dark:text-emerald-400"
              title={`예측 적중률 ${hitRate(a.predHit, a.predTotal)}% · 최고 ${a.predBest}연승`}
            >
              🎯 {hitRate(a.predHit, a.predTotal)}% ({a.predHit}/{a.predTotal})
            </span>
          ) : (
            <span className="text-neutral-400">🎯 예측 기록 없음</span>
          )}
          {!isAuthor && (
            <FollowButton
              analystId={post.authorId}
              following={isFollowingAuthor}
              from={`/analysis/${post.id}`}
              variant="compact"
            />
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
              <Link
                href={`/analysis/${post.id}/edit`}
                className="text-neutral-400 transition hover:text-rose-500"
              >
                수정
              </Link>
              <span>·</span>
              <DeletePostButton postId={post.id} />
            </>
          )}
          {/* 본인 글이면 위 수정·삭제가 이미 있으므로 관리자 버튼 중복 노출 방지 */}
          {isAdmin && !isAuthor && (
            <>
              <span>·</span>
              <Link href={`/analysis/${post.id}/edit`} className="font-semibold text-rose-500 hover:underline">
                수정
              </Link>
              <span>·</span>
              <AdminDeletePostButton postId={post.id} />
            </>
          )}
        </div>

        {/* 예측 카드 */}
        {post.pick && post.match && (
          <div className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_18px_50px_-28px_rgba(15,23,30,0.3)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <div className="flex items-center justify-between mb-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500">
                <Target className="h-3.5 w-3.5 text-rose-500" aria-hidden /> 예측 · {MARKET_LABEL[post.market ?? "1X2"] ?? "승무패"}
              </span>
              <div className="flex items-center gap-2">
                {/* 1번: 연승 로고 (작성자 연승 중) */}
                {a.predStreak >= 5 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/badge-streak5.png" alt={`${a.predStreak}연승`} className="h-11 w-auto" />
                ) : a.predStreak === 4 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/badge-streak4.png" alt="4연승" className="h-11 w-auto" />
                ) : a.predStreak === 3 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/badge-streak3.png" alt="3연승" className="h-11 w-auto" />
                ) : a.predStreak === 2 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/badge-streak2.png" alt="2연승" className="h-11 w-auto" />
                ) : null}
                {/* 2번: 적중 로고 (이 글 적중) */}
                {post.isCorrect === true ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/badge-hit.png" alt="적중" className="h-11 w-auto drop-shadow" />
                ) : (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${resultBadge.c}`}>
                    {resultBadge.t}
                  </span>
                )}
              </div>
            </div>
            <div className="text-sm">
              <span className="font-semibold">
                {home} vs {away}
              </span>
              <span className="text-neutral-500"> · {kickoffLabel(post.match.startTime)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-base sm:text-lg">
                내 예상:{" "}
                <span className="font-extrabold text-rose-600 dark:text-rose-400">{pickLabel}</span>
              </span>
              {odds != null && (
                <span className="text-sm font-bold tabular-nums text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-md">
                  배당 {fmtOdds(odds)}
                </span>
              )}
              {post.match.status === "FINISHED" && post.match.homeScore != null && (
                <span className="text-xs text-neutral-500">
                  (결과 {post.match.homeScore}:{post.match.awayScore})
                </span>
              )}
            </div>
          </div>
        )}

        {/* 첨부 — 드림팀 자랑 */}
        {dreamTeam && (
          <Link
            href={`/dream-team/team/${dreamTeam.id}`}
            className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_18px_50px_-28px_rgba(15,23,30,0.3)] transition-colors hover:ring-rose-300/60 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:ring-rose-500/40"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-rose-500">드림팀 첨부</div>
              <div className="mt-0.5 truncate font-bold">{dreamTeam.name}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {TIERS[dreamTeam.tier]?.name ?? dreamTeam.tier} · 레이팅 {dreamTeam.rating} · {dreamTeam.wins}승 {dreamTeam.draws}무 {dreamTeam.losses}패
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white">스쿼드 보기</span>
          </Link>
        )}

        {/* 첨부 — 전술판 (본문 폭 그대로 크게 — 사용자 피드백: 축소판은 너무 작음) */}
        {post.lineupCode && (
          <Link
            href={`/lineup?d=${post.lineupCode}`}
            className="mt-5 block overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_18px_50px_-28px_rgba(15,23,30,0.3)] transition-colors hover:ring-rose-300/60 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:ring-rose-500/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/og/lineup?d=${post.lineupCode}`} alt="첨부된 전술판" className="w-full" loading="lazy" />
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[11px] font-semibold text-rose-500">전술판 첨부</span>
              <span className="text-xs font-medium text-neutral-500">전술판에서 열기 →</span>
            </div>
          </Link>
        )}

        {/* 본문 (Markdown) */}
        <div className="mt-6">
          <Markdown disableAutoLink>{post.content}</Markdown>
        </div>

        {/* 추천 · 공유 */}
        <div className="mt-8 flex justify-center gap-2">
          <LikeButton
            postId={post.id}
            likes={post.likes}
            disabled={!userId || isAuthor}
          />
          <ShareButton title={post.title} />
        </div>
      </article>

      {/* 댓글 */}
      <section className="mt-12 border-t border-black/5 dark:border-white/10 pt-6">
        <h2 className="text-sm font-bold mb-4">댓글 {post.commentCount}</h2>

        {post.comments.length > 0 && (
          <ul className="space-y-4 mb-5">
            {post.comments.map((c) => (
              <CommentItem
                key={c.id}
                id={c.id}
                content={c.content}
                createdAt={c.createdAt}
                author={c.author}
                isMine={userId === c.authorId}
              />
            ))}
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
