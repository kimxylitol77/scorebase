// PlayerRelatedArticles (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것. 기사가 한국어 전용이라 /en/players 는 이 컴포넌트를 렌더하지 않는다.
import Link from "next/link";
import { prisma } from "@/lib/db";
import rawPlayerBlogLinks from "../../../../data/player-blog-links.json";

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
    // 본문에 `(/players/{pid})` 링크가 있는 글 자동 탐지.
    //  `)` 또는 `?` 로 접미사 경계 → 123 이 1234 에 매칭되는 것 방지.
    //  KBO/NPB 기사는 `(/players/123?league=KBO)` 형태라 `)` 만 보면 놓친다.
    prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ content: { contains: `(/players/${pid})` } }, { content: { contains: `(/players/${pid}?` } }],
      },
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
      <h2 className="text-lg font-semibold mb-3">{name} Related articles ({items.length})</h2>
      <div className="overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 divide-y divide-black/5 dark:divide-white/5">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
          >
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Analysis</span>
            <span className="truncate font-semibold min-w-0 flex-1">{it.title}</span>
            <span className="ml-auto shrink-0 text-xs text-neutral-400 tabular-nums">{fmtYm(it.at)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
