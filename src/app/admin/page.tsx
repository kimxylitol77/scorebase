import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안",
  PENDING_REVIEW: "검수 대기",
  APPROVED: "승인됨",
  PUBLISHED: "발행됨",
  REJECTED: "거절됨",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_REVIEW:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  PUBLISHED:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  DRAFT:
    "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
};

export default async function AdminHome() {
  const [pending, recent, counts] = await Promise.all([
    prisma.article.findMany({
      where: { status: "PENDING_REVIEW" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.article.findMany({
      where: { status: { in: ["PUBLISHED", "REJECTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.article.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const total = counts.reduce((sum, c) => sum + c._count._all, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">관리자</h1>
          <p className="mt-1 text-sm text-neutral-500">
            전체 글 {total}개 ·{" "}
            {counts.map((c) => `${STATUS_LABEL[c.status]} ${c._count._all}`).join(" / ")}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/articles"
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            📋 모든 글 관리
          </Link>
          <Link
            href="/admin/new"
            className="px-3 py-1.5 rounded-md text-sm font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition"
          >
            ＋ 새 글 작성
          </Link>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">검수 대기 ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-neutral-500">대기 중인 글이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            {pending.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/review/${a.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                >
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[a.status]}`}
                  >
                    {a.league}
                  </span>
                  <span className="flex-1 truncate font-medium">{a.title}</span>
                  <span className="text-xs text-neutral-500">
                    {new Date(a.createdAt).toLocaleString("ko-KR", {
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 처리</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">처리된 글이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            {recent.map((a) => (
              <li key={a.id} className="p-4 flex items-center gap-3 text-sm">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[a.status]}`}
                >
                  {STATUS_LABEL[a.status]}
                </span>
                <span className="text-neutral-500">{a.league}</span>
                {a.status === "PUBLISHED" ? (
                  <Link
                    href={`/articles/${a.slug}`}
                    className="flex-1 truncate hover:underline"
                  >
                    {a.title}
                  </Link>
                ) : (
                  <span className="flex-1 truncate">{a.title}</span>
                )}
                <Link
                  href={`/admin/review/${a.id}`}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white whitespace-nowrap"
                >
                  편집 →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
