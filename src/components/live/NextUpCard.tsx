// 라이브 매치 다음 동선 카드 — 검색 랜딩(1페이지 이탈) 방지: 이 경기의 게시판 픽·
// 오늘의 픽 스레드·H2H 상대전적으로 다음 클릭을 만든다 (2026-07-05 이탈 진단 후속).
import Link from "next/link";
import { BarChart3, MessagesSquare, PencilLine } from "lucide-react";
import { prisma } from "@/lib/db";
import { kstDayWindow } from "@/lib/threads/kst";

interface Props {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
  homeKo: string;
  awayKo: string;
}

export default async function NextUpCard({ matchId, homeTeamId, awayTeamId, homeKo, awayKo }: Props) {
  const { start, end } = kstDayWindow();
  const [picks, thread] = await Promise.all([
    // 이 경기에 걸린 게시판 픽 글 (최신 3)
    prisma.post.findMany({
      where: { matchId, pick: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, isCorrect: true, author: { select: { nickname: true } } },
    }),
    // 오늘의 픽 스레드 (매일 아침 자동 발행)
    prisma.post.findFirst({
      where: { title: { startsWith: "오늘의 픽 스레드" }, createdAt: { gte: start, lt: end } },
      select: { id: true, commentCount: true },
    }),
  ]);

  const h2hHref = `/h2h/${Math.min(homeTeamId, awayTeamId)}-vs-${Math.max(homeTeamId, awayTeamId)}`;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] p-4 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <h2 className="text-sm font-bold tracking-tight mb-3">이 경기 더 보기</h2>

      {picks.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {picks.map((p) => (
            <li key={p.id}>
              <Link
                href={`/analysis/${p.id}`}
                prefetch={false}
                className="group flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
              >
                <span className="shrink-0 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  픽
                </span>
                <span className="truncate group-hover:underline">
                  {p.title}
                  <span className="ml-1 text-xs text-neutral-400">— {p.author?.nickname}</span>
                </span>
                {p.isCorrect != null && (
                  <span className={`shrink-0 text-[11px] font-bold ${p.isCorrect ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}>
                    {p.isCorrect ? "적중" : "실패"}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 text-sm font-medium">
        <Link
          href={h2hHref}
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {homeKo} vs {awayKo} 상대전적
        </Link>
        {thread && (
          <Link
            href={`/analysis/${thread.id}`}
            prefetch={false}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-1.5 text-neutral-700 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
          >
            <MessagesSquare className="h-3.5 w-3.5 shrink-0" aria-hidden />
            오늘의 픽 스레드{thread.commentCount > 0 ? ` (댓글 ${thread.commentCount})` : ""}
          </Link>
        )}
        <Link
          href="/analysis/new"
          prefetch={false}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-1.5 text-rose-600 transition hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
        >
          <PencilLine className="h-3.5 w-3.5 shrink-0" aria-hidden />
          내 픽 남기기 — 자동 채점
        </Link>
      </div>
    </section>
  );
}
