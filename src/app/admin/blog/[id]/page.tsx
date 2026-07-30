import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import BlogForm from "../BlogForm";
import { updateBlog } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditBlogPage({ params }: Props) {
  const { id } = await params;
  const b = await prisma.blog.findUnique({ where: { id: Number(id) } });
  if (!b) notFound();

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
      <h1 className="text-2xl font-bold tracking-tight mb-2">블로그 글 편집</h1>
      <p className="text-sm text-neutral-500 mb-6">
        URL: <span className="font-mono">/blog/{b.slug}</span>
      </p>
      <BlogForm
        action={updateBlog}
        submitLabel="저장"
        initial={{
          id: b.id,
          title: b.title,
          slug: b.slug,
          excerpt: b.excerpt,
          content: b.content,
          tags: b.tags,
          thumbnailUrl: b.thumbnailUrl,
          publishedAt: b.publishedAt.toISOString(),
        }}
      />
    </main>
  );
}
