import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import Markdown from "@/components/Markdown";
import DOMPurify from "isomorphic-dompurify";

export const revalidate = 600;

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

// blog 본문 HTML 정화 — script·이벤트핸들러(on*)·javascript: 제거, iframe(임베드)만 허용.
// admin 작성이지만 계정 탈취·DB 변조 시의 저장형 XSS 를 차단한다.
function sanitizeBlogHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "scrolling", "loading", "referrerpolicy"],
  });
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const b = await prisma.blog.findUnique({ where: { slug } });
  if (!b) return { title: "블로그" };
  const description =
    b.excerpt ?? b.content.slice(0, 160).replace(/\n/g, " ").replace(/[#*`]/g, "");
  const keywords = b.tags
    ? b.tags.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  return {
    title: `${b.title} — 스코어베이스`,
    description,
    keywords,
    alternates: { canonical: `${SITE_URL}/blog/${slug}` },
    openGraph: {
      title: b.title,
      description,
      url: `${SITE_URL}/blog/${slug}`,
      type: "article",
      publishedTime: b.publishedAt.toISOString(),
      images: b.thumbnailUrl ? [{ url: b.thumbnailUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: b.title,
      description,
      images: b.thumbnailUrl ? [b.thumbnailUrl] : undefined,
    },
  };
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const b = await prisma.blog.findUnique({ where: { slug } });
  if (!b) notFound();

  // JSON-LD BlogPosting — SEO 구조화 데이터
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: b.title,
    description: b.excerpt ?? undefined,
    datePublished: b.publishedAt.toISOString(),
    dateModified: b.updatedAt.toISOString(),
    author: {
      "@type": "Organization",
      name: "스코어베이스",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "스코어베이스",
      url: SITE_URL,
    },
    image: b.thumbnailUrl ?? undefined,
    keywords: b.tags ?? undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}/blog/${slug}` },
  };

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-6">
        <Link
          href="/blog"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← 블로그 목록
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex items-center gap-2 mb-3 text-xs text-neutral-500">
          <span>{formatDateKo(b.publishedAt)}</span>
          {b.tags && <span>· {b.tags}</span>}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
          {b.title}
        </h1>
        {b.excerpt && (
          <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
            {b.excerpt}
          </p>
        )}
      </header>

      {/* content 가 HTML(<article ... > 시작) 이면 정화 후 렌더, 아니면 Markdown. */}
      {/^\s*<(article|div|section|p|h[1-6])\b/i.test(b.content) ? (
        <div
          className="blog-html prose prose-neutral dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(b.content) }}
        />
      ) : (
        <Markdown>{b.content}</Markdown>
      )}
    </main>
  );
}
