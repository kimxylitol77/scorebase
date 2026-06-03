import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { displayGrade } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, hitRate } from "@/lib/analysis/format";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic"; // 조회/추천 실시간 반영

export const metadata: Metadata = {
  title: "스포츠 분석 게시판 — 축구·야구·농구 승부예측 + 적중 자동채점",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 모든 예측은 실제 경기 결과로 자동 채점되어 적중률·연승으로 랭킹이 매겨집니다. EPL·라리가·MLB·NBA·NHL.",
  keywords: [
    "스포츠 분석", "승부예측", "축구 분석", "경기 분석 게시판", "스포츠 픽",
    "예측 적중률", "스포츠 커뮤니티", "축구 예측", "야구 분석", "스포츠 토론",
  ],
  alternates: { canonical: `${SITE_URL}/analysis` },
  openGraph: {
    title: "스포츠 분석 게시판 — 스코어베이스",
    description: "회원 경기 분석·승부 예측 + 적중 자동채점·랭킹.",
    url: `${SITE_URL}/analysis`,
  },
};

// 구조화 데이터 (CollectionPage) — 분석 커뮤니티를 콘텐츠 페이지로 인식.
const ANALYSIS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "스포츠 분석 게시판 — 스코어베이스",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 예측 적중은 실제 경기 결과로 자동 채점됩니다.",
  url: `${SITE_URL}/analysis`,
  isPartOf: { "@type": "WebSite", name: "스코어베이스", url: SITE_URL },
  about: "스포츠 경기 분석 및 승부 예측 커뮤니티",
  inLanguage: "ko-KR",
};

// 데스크탑 그리드 컬럼 — 제목(1fr)을 넓게, 나머지는 고정폭
const COLS = "sm:grid-cols-[72px_minmax(0,1fr)_180px_96px_80px_72px]";

const PAGE_SIZE = 20;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

// 페이지 번호 목록 (총 7개 초과 시 … 으로 축약: 1 … 4 5 6 … 10)
function pageList(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

export default async function AnalysisListPage({ searchParams }: Props) {
  const { page } = await searchParams;
  const cur = Math.max(1, Number(page) || 1);
  const [posts, total, userId] = await Promise.all([
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      skip: (cur - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        views: true,
        likes: true,
        commentCount: true,
        createdAt: true,
        isCorrect: true,
        author: {
          select: {
            nickname: true,
            level: true,
            badge: true,
            predTotal: true,
            predHit: true,
            predStreak: true,
          },
        },
      },
    }),
    prisma.post.count(),
    getCurrentUserId(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ANALYSIS_JSONLD) }}
      />
      <header className="mb-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-500 mb-2">커뮤니티</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">스포츠 분석</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/analysis/ranking"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 px-4 py-2.5 text-sm font-semibold transition"
            >
              🏆 랭킹
            </Link>
            <Link
              href="/analysis/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 text-sm font-semibold transition"
            >
              ✏️ 글쓰기
            </Link>
          </div>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          회원이 올린 경기 분석·승부 예측이 실제 결과로 자동 채점되어 적중률·랭킹에 반영됩니다.
        </p>
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
              const g = displayGrade(p.author.level, p.author.badge);
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
                        {p.isCorrect === true && (
                          <span
                            title="예측 적중"
                            className="shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-yellow-950 shadow-[0_0_8px_rgba(234,179,8,0.55)]"
                          >
                            ✓적중
                          </span>
                        )}
                        {p.isCorrect === false && (
                          <span title="예측 미적중" className="opacity-50">❌</span>
                        )}
                        <span className="truncate font-semibold text-base">{p.title}</span>
                        {p.commentCount > 0 && (
                          <span className="shrink-0 text-xs font-semibold text-rose-500">
                            [{p.commentCount}]
                          </span>
                        )}
                      </span>
                      {/* mobile meta */}
                      <span className="sm:hidden mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
                        <span>
                          {g.emoji} {a.nickname}
                        </span>
                        {a.predTotal > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            🎯{hitRate(a.predHit, a.predTotal)}%
                          </span>
                        ) : (
                          <span className="text-neutral-400">🎯 기록없음</span>
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
                      {a.predTotal > 0 ? (
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          🎯 {hitRate(a.predHit, a.predTotal)}% ({a.predHit}/{a.predTotal})
                          {a.predStreak >= 2 && ` 🔥${a.predStreak}`}
                        </span>
                      ) : (
                        <span className="text-[11px] text-neutral-400">🎯 예측 기록 없음</span>
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

      {totalPages > 1 && (
        <nav className="flex justify-center items-center gap-1.5 mt-6">
          {cur > 1 && (
            <Link
              href={`/analysis?page=${cur - 1}`}
              className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              ‹
            </Link>
          )}
          {pageList(cur, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-2 text-neutral-400">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={`/analysis?page=${p}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                  p === cur
                    ? "bg-rose-600 text-white border-rose-600"
                    : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {p}
              </Link>
            ),
          )}
          {cur < totalPages && (
            <Link
              href={`/analysis?page=${cur + 1}`}
              className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              ›
            </Link>
          )}
        </nav>
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

      {/* SEO 본문 — 게시판 소개 + 차별화(적중 자동채점) + 가치 페이지 내부링크 */}
      <section className="mt-12 border-t border-neutral-200 dark:border-neutral-800 pt-8 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          스포츠 분석 게시판이란?
        </h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          스코어베이스 분석 게시판은 회원이 직접 축구·야구·농구·하키 경기를 분석하고
          승부를 예측하는 커뮤니티입니다. 다른 사이트와 달리{" "}
          <strong>모든 예측은 실제 경기 결과로 자동 채점</strong>되어, 적중률·연승
          기록이 작성자 프로필과{" "}
          <Link href="/analysis/ranking" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            예측 랭킹
          </Link>
          에 그대로 남습니다. 감이 아니라 검증된 기록으로 실력을 증명할 수 있습니다.
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          스코어베이스 AI 모델의 예측 적중률은{" "}
          <Link href="/predictions/accuracy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            적중률 보드
          </Link>
          에서, 리그별 시즌 우승 확률은{" "}
          <Link href="/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            시즌 예측
          </Link>
          에서 데이터로 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
