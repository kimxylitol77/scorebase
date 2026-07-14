// 선수 페이지 "관련 글 바로가기".
// 두 축으로 글을 찾는다: (1) data/player-blog-links.json 수동 등재 slug, (2) 본문에 이 선수의
// 선수페이지 링크 `(/players/{pid})` 가 박힌 글 자동 탐지(MLB 주간 베스트 선수 등이 자동으로 붙음).
// Blog(/blog/)·Article(/articles/) 조회해 하나의 섹션으로 렌더 (축구·야구 공용).
import Link from "next/link";
import { prisma } from "@/lib/db";
import rawPlayerBlogLinks from "../../../data/player-blog-links.json";

const fmtYm = (d: Date | null) =>
  d ? d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "") : "";

export default async function PlayerRelatedArticles({ pid, name }: { pid: string; name: string }) {
  const slugs = (rawPlayerBlogLinks as Record<string, string[]>)[pid] ?? [];

  const [blogs, articles, linkedArticles] = await Promise.all([
    slugs.length
      ? prisma.blog.findMany({
          where: { slug: { in: slugs } },
          orderBy: { publishedAt: "desc" },
          select: { slug: true, title: true, publishedAt: true },
        })
      : Promise.resolve([]),
    slugs.length
      ? prisma.article.findMany({
          where: { slug: { in: slugs }, status: "PUBLISHED" },
          orderBy: { publishedAt: "desc" },
          select: { slug: true, title: true, publishedAt: true },
        })
      : Promise.resolve([]),
    // 본문에 `(/players/{pid})` 링크가 있는 글 자동 탐지. `)` 로 접미사 경계 → 123 이 1234 매칭 방지.
    prisma.article.findMany({
      where: { status: "PUBLISHED", content: { contains: `(/players/${pid})` } },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, publishedAt: true },
      take: 12,
    }),
  ]);

  const bySlug = new Map<string, { href: string; title: string; at: Date | null }>();
  for (const b of blogs) bySlug.set(`blog:${b.slug}`, { href: `/blog/${b.slug}`, title: b.title, at: b.publishedAt });
  for (const a of [...articles, ...linkedArticles]) {
    bySlug.set(`article:${a.slug}`, { href: `/articles/${a.slug}`, title: a.title, at: a.publishedAt });
  }
  const items = [...bySlug.values()].sort((x, y) => (y.at?.getTime() ?? 0) - (x.at?.getTime() ?? 0));
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold mb-3">{name} 관련 글 ({items.length})</h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 divide-y divide-black/5 dark:divide-white/5">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
          >
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">분석</span>
            <span className="truncate font-semibold min-w-0 flex-1">{it.title}</span>
            <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">{fmtYm(it.at)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
