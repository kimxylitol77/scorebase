import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import { deleteBlog } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminBlogPage() {
  const posts = await prisma.blog.findMany({
    orderBy: { publishedAt: "desc" },
  });
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">블로그</h1>
          <p className="text-sm text-neutral-500 mt-1">
            SEO 키워드 타깃 블로그 글을 관리합니다.
          </p>
        </div>
        <Link
          href="/admin/blog/new"
          className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 transition"
        >
          + 새 글
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500 py-12 text-center">
          등록된 글이 없습니다.
        </p>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900/50 text-[11px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="text-left px-4 py-3 font-semibold">제목</th>
                <th className="text-left px-4 py-3 font-semibold">태그</th>
                <th className="text-left px-4 py-3 font-semibold">slug</th>
                <th className="text-left px-4 py-3 font-semibold">발행일</th>
                <th className="text-right px-4 py-3 font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {posts.map((b) => (
                <tr key={b.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/blog/${b.slug}`}
                      target="_blank"
                      className="font-medium hover:text-blue-600 dark:hover:text-blue-400 transition"
                    >
                      {b.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500 max-w-[180px] truncate">
                    {b.tags || "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500 truncate max-w-[200px]">
                    {b.slug}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                    {formatDateKo(b.publishedAt)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/admin/blog/${b.id}`}
                      className="text-xs px-2.5 py-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition mr-2"
                    >
                      편집
                    </Link>
                    <form action={deleteBlog} className="inline">
                      <input type="hidden" name="id" value={b.id} />
                      <button
                        type="submit"
                        className="text-xs px-2.5 py-1 rounded-md bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-950/60 transition"
                      >
                        삭제
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
