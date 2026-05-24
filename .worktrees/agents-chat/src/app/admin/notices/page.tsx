import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import { deleteNotice } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, { label: string; tone: string }> = {
  CHANGELOG: { label: "패치노트", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400" },
  NOTICE: { label: "공지", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  MAINTENANCE: { label: "점검", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
};

export default async function AdminNoticesPage() {
  const notices = await prisma.notice.findMany({
    orderBy: { publishedAt: "desc" },
  });
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">공지사항 · 패치노트</h1>
          <p className="text-sm text-neutral-500 mt-1">
            새 변화·점검·이벤트를 알리는 글을 관리합니다.
          </p>
        </div>
        <Link
          href="/admin/notices/new"
          className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 transition"
        >
          + 새 공지
        </Link>
      </div>

      {notices.length === 0 ? (
        <p className="text-sm text-neutral-500 py-12 text-center">
          등록된 공지가 없습니다.
        </p>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">타입</th>
                <th className="text-left px-4 py-3 font-semibold">제목</th>
                <th className="text-left px-4 py-3 font-semibold">slug</th>
                <th className="text-left px-4 py-3 font-semibold">발행일</th>
                <th className="text-right px-4 py-3 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {notices.map((n) => {
                const t = TYPE_LABEL[n.type] ?? TYPE_LABEL.NOTICE;
                return (
                  <tr key={n.id}>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${t.tone}`}
                      >
                        {t.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/notices/${n.slug}`}
                        target="_blank"
                        className="font-medium hover:text-blue-600 dark:hover:text-blue-400 transition"
                      >
                        {n.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500 truncate max-w-[200px]">
                      {n.slug}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                      {formatDateKo(n.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <Link
                        href={`/admin/notices/${n.id}`}
                        className="text-xs px-2.5 py-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition mr-2"
                      >
                        편집
                      </Link>
                      <form action={deleteNotice} className="inline">
                        <input type="hidden" name="id" value={n.id} />
                        <button
                          type="submit"
                          className="text-xs px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-950/60 transition"
                        >
                          삭제
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
