import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { gradeByLevel } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, hitRate } from "@/lib/analysis/format";

export const dynamic = "force-dynamic"; // 조회/추천 실시간 반영

export const metadata: Metadata = {
  title: "스포츠 분석 게시판 — 스코어베이스",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 예측 적중은 실제 경기 결과로 자동 채점됩니다.",
};

// 데스크탑 그리드 컬럼 — 제목(1fr)을 넓게, 나머지는 고정폭
const COLS = "sm:grid-cols-[72px_minmax(0,1fr)_180px_96px_80px_72px]";

export default async function AnalysisListPage() {
  const [posts, userId] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        views: true,
        likes: true,
        createdAt: true,
        isCorrect: true,
        author: {
          select: {
            nickname: true,
            level: true,
            predTotal: true,
            predHit: true,
            predStreak: true,
          },
        },
      },
    }),
    getCurrentUserId(),
  ]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <header className="flex items-end justify-between mb-8">
        <div>
          <p className="text-sm text-neutral-500 mb-1.5">커뮤니티</p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">스포츠 분석</h1>
        </div>
        <Link
          href="/analysis/new"
          className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 text-sm font-semibold transition"
        >
          ✏️ 글쓰기
        </Link>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500 py-24 text-center">
          아직 등록된 분석글이 없습니다. 첫 글을 남겨보세요!
        </p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80">
          {/* header row (desktop) */}
          <div
            className={`hidden sm:grid ${COLS} gap-4 px-6 py-3.5 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-800`}
          >
            <span>분류</span>
            <span>제목</span>
            <span>작성자</span>
            <span className="text-right">등록일</span>
            <span className="text-right">조회</span>
            <span className="text-right">추천</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {posts.map((p) => {
              const g = gradeByLevel(p.author.level);
              const a = p.author;
              return (
                <li key={p.id}>
                  <Link
                    href={`/analysis/${p.id}`}
                    className={`grid grid-cols-[1fr] ${COLS} gap-4 px-6 py-4 items-center hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition`}
                  >
                    <span className="hidden sm:inline text-xs font-bold text-blue-600 dark:text-blue-400">
                      분석
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {p.isCorrect === true && <span title="예측 적중">🎯</span>}
                        {p.isCorrect === false && (
                          <span title="예측 미적중" className="opacity-50">❌</span>
                        )}
                        <span className="truncate font-semibold text-base">{p.title}</span>
                        {p.likes > 0 && (
                          <span className="shrink-0 text-xs font-semibold text-rose-500">
                            [{p.likes}]
                          </span>
                        )}
                      </span>
                      {/* mobile meta */}
                      <span className="sm:hidden mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
                        <span>
                          {g.emoji} {a.nickname}
                        </span>
                        {a.predTotal > 0 && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            🎯{hitRate(a.predHit, a.predTotal)}%
                          </span>
                        )}
                        <span>·</span>
                        <span>{listTime(p.createdAt)}</span>
                      </span>
                    </span>
                    <span
                      className="hidden sm:flex flex-col justify-center text-sm text-neutral-600 dark:text-neutral-400 min-w-0"
                      title={g.name}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{g.emoji}</span>
                        <span className="truncate">{a.nickname}</span>
                      </span>
                      {a.predTotal > 0 && (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          🎯 {hitRate(a.predHit, a.predTotal)}%
                          {a.predStreak >= 3 && ` 🔥${a.predStreak}`}
                        </span>
                      )}
                    </span>
                    <span className="hidden sm:block text-right text-sm text-neutral-500">
                      {listTime(p.createdAt)}
                    </span>
                    <span className="hidden sm:block text-right text-sm text-neutral-500">
                      {p.views}
                    </span>
                    <span className="hidden sm:block text-right text-sm font-semibold text-rose-500">
                      {p.likes}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!userId && (
        <p className="mt-5 text-sm text-neutral-500 text-center">
          글쓰기·추천은{" "}
          <Link href="/login?from=/analysis" className="text-blue-600 dark:text-blue-400 underline">
            로그인
          </Link>{" "}
          후 가능합니다.
        </p>
      )}
    </main>
  );
}
