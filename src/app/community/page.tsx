// 자유게시판 목록 — 잡담·드림팀 자랑·전술판 공유 (Post category=FREE, 상세는 /analysis/[id] 공용)
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { displayGrade } from "@/lib/user-level";
import { listTime } from "@/lib/analysis/format";
import { MessageSquare, Eye, ThumbsUp, PenLine } from "lucide-react";

export const metadata: Metadata = {
  title: "자유게시판 | Scorebase",
  description: "스포츠 잡담부터 드림팀 자랑, 전술판 공유까지 — 스코어베이스 자유게시판.",
};
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// 말머리 탭 — Post.sport 재사용 (soccer/baseball, null=잡담). 글이 늘면 URL 분리 검토.
const TAGS = [
  { key: "", label: "전체" },
  { key: "soccer", label: "축구" },
  { key: "baseball", label: "야구" },
  { key: "talk", label: "잡담" },
] as const;
const TAG_BADGE: Record<string, string> = { soccer: "축구", baseball: "야구" };

export default async function CommunityBoardPage({ searchParams }: { searchParams: Promise<{ page?: string; tag?: string }> }) {
  const { page, tag: tagRaw } = await searchParams;
  const cur = Math.max(1, Number(page) || 1);
  const tag = TAGS.some((t) => t.key === tagRaw) ? (tagRaw ?? "") : "";
  const where = {
    category: "FREE",
    ...(tag === "talk" ? { sport: null } : tag ? { sport: tag } : {}),
  };
  const [posts, total, userId] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (cur - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, title: true, views: true, likes: true, commentCount: true, createdAt: true,
        dreamTeamId: true, lineupCode: true, sport: true,
        author: { select: { nickname: true, level: true, badge: true } },
      },
    }),
    prisma.post.count({ where }),
    getCurrentUserId(),
  ]);
  const tagHref = (t: string, p = 1) => {
    const q = new URLSearchParams();
    if (t) q.set("tag", t);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/community?${qs}` : "/community";
  };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* 앰비언트 배경 — /analysis 와 동일 헤더 톤 (커뮤니티 섹션 일관) */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
        <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
        <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
      </div>

      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 커뮤니티
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight break-keep">자유게시판</h1>
            <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
              잡담부터 드림팀 자랑, 전술판 공유까지 자유롭게.
            </p>
          </div>
          <Link
            href={userId ? "/community/new" : "/login?from=/community/new"}
            className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-rose-500"
          >
            <PenLine className="h-4 w-4" aria-hidden /> 글쓰기
          </Link>
        </div>
      </header>

      {/* 말머리 탭 */}
      <div className="mb-4 flex gap-1 rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04] sm:inline-flex">
        {TAGS.map((t) => (
          <Link
            key={t.key}
            href={tagHref(t.key)}
            className={`flex-1 rounded-full px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${
              tag === t.key
                ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
          <p className="text-sm text-neutral-500">아직 글이 없습니다. 첫 글의 주인공이 되어보세요.</p>
          <p className="mt-1.5 text-xs text-neutral-400">드림팀을 만들었다면 자랑글로 시작해보는 건 어때요?</p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_18px_50px_-28px_rgba(15,23,30,0.25)] divide-y divide-neutral-100 dark:divide-white/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          {posts.map((p) => {
            const g = displayGrade(p.author.level, p.author.badge);
            return (
              <li key={p.id}>
                <Link href={`/analysis/${p.id}`} className="block px-4 py-3.5 transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04] sm:px-5">
                  <div className="flex items-center gap-2">
                    {p.sport && TAG_BADGE[p.sport] && (
                      <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-bold text-neutral-500 dark:bg-white/10 dark:text-neutral-300">
                        {TAG_BADGE[p.sport]}
                      </span>
                    )}
                    <span className="min-w-0 truncate font-semibold text-neutral-900 dark:text-white">{p.title}</span>
                    {p.dreamTeamId && (
                      <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">드림팀</span>
                    )}
                    {p.lineupCode && (
                      <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">전술판</span>
                    )}
                    {p.commentCount > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-rose-500">[{p.commentCount}]</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    <span title={g.name}>{g.emoji} {p.author.nickname}</span>
                    <span>·</span>
                    <span>{listTime(p.createdAt)}</span>
                    <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" aria-hidden />{p.views}</span>
                    <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" aria-hidden />{p.likes}</span>
                    <span className="inline-flex items-center gap-0.5"><MessageSquare className="h-3 w-3" aria-hidden />{p.commentCount}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-1.5 text-sm">
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - cur) <= 2)
            .map((p, idx, arr) => (
              <span key={p} className="flex items-center gap-1.5">
                {idx > 0 && arr[idx - 1] !== p - 1 && <span className="text-neutral-400">…</span>}
                <Link
                  href={tagHref(tag, p)}
                  className={`rounded-lg px-3 py-1.5 ${p === cur ? "bg-rose-600 font-semibold text-white" : "bg-white text-neutral-600 ring-1 ring-black/10 hover:bg-neutral-50 dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15"}`}
                >
                  {p}
                </Link>
              </span>
            ))}
        </div>
      )}
    </main>
  );
}
