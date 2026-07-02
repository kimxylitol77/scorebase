// 블로그 RSS 2.0 피드 — 네이버 서치어드바이저 RSS 제출 + 피드 리더 구독용.
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 3600;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const posts = await prisma.blog.findMany({
    orderBy: { publishedAt: "desc" },
    take: 30,
    select: { slug: true, title: true, excerpt: true, publishedAt: true },
  });
  const items = posts
    .map((p) => {
      const url = `${SITE_URL}/blog/${p.slug}`;
      return [
        "  <item>",
        `    <title>${esc(p.title)}</title>`,
        `    <link>${url}</link>`,
        `    <guid isPermaLink="true">${url}</guid>`,
        `    <pubDate>${p.publishedAt.toUTCString()}</pubDate>`,
        p.excerpt ? `    <description>${esc(p.excerpt)}</description>` : null,
        "  </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>스코어베이스 블로그</title>
  <link>${SITE_URL}/blog</link>
  <description>데이터로 보는 글로벌 스포츠 — AI 예측·이적시장·월드컵 데이터 분석</description>
  <language>ko</language>
  <lastBuildDate>${(posts[0]?.publishedAt ?? new Date()).toUTCString()}</lastBuildDate>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
