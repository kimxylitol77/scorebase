import BlogForm from "../BlogForm";
import { createBlog } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function NewBlogPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <Link
          href="/admin/blog"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← 목록
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">새 블로그 글 작성</h1>
      <BlogForm action={createBlog} submitLabel="발행" />
    </main>
  );
}
