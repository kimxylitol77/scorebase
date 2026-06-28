// 블로그 글 상세 — 데이터 분석 본문(저작권·출처 JSON-LD).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatDateKo } from "@/lib/format";
import Markdown from "@/components/Markdown";
import AmbientGlow from "@/components/AmbientGlow";
import sanitizeHtml from "sanitize-html";
import { SITE_URL } from "@/lib/site-url"; // www 강제 정규화(apex 새어나감 방지)

export const revalidate = 600;

// blog 본문 HTML 정화 정책 — script·이벤트핸들러(on*)·javascript: 는 제거하되
// 레이아웃에 필요한 인라인 style 과 본문 태그(figure·table·iframe 등)는 보존한다.
// sanitize-html 은 jsdom 비의존(htmlparser2) 이라 서버 런타임에서 안전.
const BLOG_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "article", "section", "div", "figure", "figcaption", "p", "span", "br", "hr",
    "h1", "h2", "h3", "h4", "h5", "h6", "a", "img", "strong", "em", "b", "i", "u", "s",
    "small", "mark", "sub", "sup", "ul", "ol", "li", "blockquote", "pre", "code",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "iframe",
  ],
  allowedAttributes: {
    "*": ["class", "style", "id"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "width", "height", "loading"],
    iframe: ["src", "width", "height", "allow", "allowfullscreen", "frameborder", "loading"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  allowedIframeHostnames: ["www.youtube.com", "youtube.com", "player.vimeo.com"],
};

// 본문을 정화하고, 안에 든 JSON-LD(application/ld+json) 는 검증해 분리한다.
// script 는 본문에서 모두 제거되며, JSON 으로 파싱 통과한 JSON-LD 만 별도 <script> 로 안전 재삽입한다.
// 글 하나에 여러 스키마(BreadcrumbList + FAQPage 등)가 들어 있을 수 있으므로 전부 추출한다.
function prepareBlogContent(content: string): { body: string; ldJsons: string[] } {
  const ldJsons: string[] = [];
  for (const m of content.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      // 임의 JS 차단(파싱돼야 통과) + "<" escape 로 </script> breakout 방지
      ldJsons.push(JSON.stringify(JSON.parse(m[1])).replace(/</g, "\\u003c"));
    } catch {
      // 파싱 실패한 블록은 버린다
    }
  }
  return { body: sanitizeHtml(content, BLOG_SANITIZE), ldJsons };
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
    // 저작권 주체 명시 — 도용 시 권리자를 구조화 데이터로 못박는다(DMCA 근거).
    copyrightHolder: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
    copyrightYear: b.publishedAt.getFullYear(),
  };

  const isHtmlContent = /^\s*<(article|div|section|p|h[1-6])\b/i.test(b.content);
  const prepared = isHtmlContent ? prepareBlogContent(b.content) : null;

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-6">
        <Link
          href="/blog"
          className="text-sm text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white"
        >
          ← 블로그 목록
        </Link>
      </div>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 블로그
          </span>
          <span className="text-xs text-neutral-500">{formatDateKo(b.publishedAt)}</span>
          {b.tags && <span className="text-xs text-neutral-500">· {b.tags}</span>}
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight break-keep">
          {b.title}
        </h1>
        {b.excerpt && (
          <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
            {b.excerpt}
          </p>
        )}
      </header>

      {/* HTML 본문은 정화 후 렌더(script·on*·javascript: 제거, style·태그 보존),
          JSON-LD 만 검증해 분리 재삽입. 아니면 Markdown. */}
      {prepared ? (
        <>
          <div
            className="blog-html prose prose-neutral dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: prepared.body }}
          />
          {prepared.ldJsons.map((ld, i) => (
            <script
              key={i}
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: ld }}
            />
          ))}
        </>
      ) : (
        <Markdown>{b.content}</Markdown>
      )}
      <p className="mt-8 border-t border-black/5 pt-4 text-xs leading-relaxed text-zinc-500 break-keep dark:border-white/10 dark:text-white/50">
        © 스코어베이스. 이 글의 원문은{" "}
        <a
          href={`${SITE_URL}/blog/${slug}`}
          className="underline underline-offset-2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-900 dark:hover:text-white"
        >
          {`${SITE_URL}/blog/${slug}`.replace(/^https?:\/\//, "")}
        </a>
        {" "}입니다. 무단 전재·재배포를 금합니다.
      </p>
    </main>
  );
}
