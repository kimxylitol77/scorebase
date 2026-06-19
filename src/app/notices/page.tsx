// 공지/패치노트 목록 — 사이트 공지·변경 이력(CHANGELOG·NOTICE·MAINTENANCE).
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";

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
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <header className="mb-8">
        <p className="text-sm text-neutral-500 mb-2">사이트 소식</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          공지사항 · 패치노트
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          새 기능, 모델 개선, 점검 소식을 한 곳에서.
        </p>
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
                  className="block rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-5 hover:border-neutral-300 dark:hover:border-neutral-700 transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${t.tone}`}
                    >
                      {t.label}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {formatDateKo(n.publishedAt)}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold leading-snug">
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
