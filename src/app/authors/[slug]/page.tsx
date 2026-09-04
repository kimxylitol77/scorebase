// 저자 페이지 — 운영자 실체(Person JSON-LD·소개·최근 블로그 글). lib/seo/author 에 이름이 없으면 404.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_AUTHOR, authorPersonLd } from "@/lib/seo/author";
import { breadcrumbLd, jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 3600;

export function generateStaticParams() {
  return SITE_AUTHOR ? [{ slug: SITE_AUTHOR.slug }] : [];
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SITE_AUTHOR || slug !== SITE_AUTHOR.slug) return {};
  return {
    title: `${SITE_AUTHOR.name} — ${SITE_AUTHOR.jobTitle}`,
    description: SITE_AUTHOR.bio,
    alternates: { canonical: SITE_AUTHOR.url },
  };
}

function formatDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}. ${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  if (!SITE_AUTHOR || slug !== SITE_AUTHOR.slug) notFound();

  const posts = await prisma.blog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 10,
    select: { slug: true, title: true, publishedAt: true },
  });

  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      authorPersonLd(),
      breadcrumbLd([
        { name: "홈", path: "/" },
        { name: "블로그", path: "/blog" },
        { name: SITE_AUTHOR.name, path: `/authors/${SITE_AUTHOR.slug}` },
      ]),
    ],
  };

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-neutral-500">저자</p>
        <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight break-keep">{SITE_AUTHOR.name}</h1>
        <p className="mt-1 text-sm text-neutral-500">{SITE_AUTHOR.jobTitle}</p>
        <p className="mt-4 text-base leading-relaxed text-neutral-700 dark:text-neutral-300 break-keep">{SITE_AUTHOR.bio}</p>
        <ul className="mt-4 flex flex-wrap gap-3 text-sm">
          <li>
            <Link href="/predictions/accuracy" className="underline underline-offset-2">예측 적중률 공개</Link>
          </li>
          <li>
            <Link href="/en/benchmark" className="underline underline-offset-2">LLM 예측 벤치마크</Link>
          </li>
          <li>
            <Link href="/about" className="underline underline-offset-2">사이트 소개·방법론</Link>
          </li>
          {SITE_AUTHOR.sameAs.map((u) => (
            <li key={u}>
              <a href={u} rel="me noopener" className="underline underline-offset-2">
                {u.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </li>
          ))}
        </ul>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">최근 글</h2>
        <ul className="divide-y divide-neutral-200 dark:divide-white/10">
          {posts.map((p) => (
            <li key={p.slug} className="py-3">
              <Link href={`/blog/${p.slug}`} className="font-medium hover:underline break-keep">
                {p.title}
              </Link>
              <span className="ml-2 text-xs text-neutral-500">{formatDate(p.publishedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
