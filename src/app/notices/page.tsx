// 공지/패치노트 목록 — 사이트 공지·변경 이력(CHANGELOG·NOTICE·MAINTENANCE).
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import BoardTabs from "@/components/BoardTabs";

export const revalidate = 600; // 10분

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "공지사항 · 패치노트",
  description:
    "스코어베이스 사이트 업데이트, 새 기능, 모델 개선, 점검 소식을 한 곳에서.",
  alternates: { canonical: `${SITE_URL}/notices` },
};

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  CHANGELOG: {
    label: "패치노트",
    tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  },
  NOTICE: {
    label: "공지",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
  MAINTENANCE: {
    label: "점검",
    tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  },
};

export default async function NoticesPage() {
  const notices = await prisma.notice.findMany({
    orderBy: { publishedAt: "desc" },
    take: 50,
  });

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      {/* 앰비언트 배경 — 상단에 은은한 메시 글로우 */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
        <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
        <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
      </div>

      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 사이트 소식
        </span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight break-keep">
          공지사항 · 패치노트
        </h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          새 기능, 모델 개선, 점검 소식을 한 곳에서.
        </p>
        <div className="mt-6">
          <BoardTabs active="notices" />
        </div>
      </header>

      {/* 공지 list */}
      {notices.length === 0 ? (
        <p className="text-sm text-neutral-500 py-12 text-center">
          아직 등록된 공지가 없습니다.
        </p>
      ) : (
        <ul className="space-y-3 max-w-3xl">
          {notices.map((n) => {
            const t = TYPE_LABEL[n.type] ?? TYPE_LABEL.NOTICE;
            return (
              <li key={n.id}>
                <Link
                  href={`/notices/${n.slug}`}
                  className="group block rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_14px_40px_-26px_rgba(15,23,30,0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:ring-black/10 dark:bg-white/[0.04] dark:shadow-none dark:ring-white/10 dark:hover:bg-white/[0.06] dark:hover:ring-white/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${t.tone}`}
                    >
                      {t.label}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatDateKo(n.publishedAt)}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold leading-snug break-keep transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400">
                    {n.title}
                  </h2>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
