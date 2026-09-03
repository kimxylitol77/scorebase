// 빙 웹마스터 제출용 전체 사이트맵 — live·h2h·선수 프로필 전량 포함 (종전 sitemap.xml 범위).
// robots.txt 엔 올리지 않는다(구글이 따라 읽으면 lean 분리가 무의미). 빙에는 수동 제출.
import { buildSitemapEntries } from "@/lib/seo/sitemap-entries";

export const revalidate = 3600;

// Next 의 sitemap 빌더와 같은 규칙 — loc 는 이미 XML-safe 로 넣어 두므로(squad 의 &amp;) 재이스케이프 안 함.
function toXml(entries: Awaited<ReturnType<typeof buildSitemapEntries>>["full"]): string {
  const rows = entries.map((e) => {
    const lastmod = e.lastModified
      ? `<lastmod>${(e.lastModified instanceof Date ? e.lastModified : new Date(e.lastModified)).toISOString()}</lastmod>`
      : "";
    const freq = e.changeFrequency ? `<changefreq>${e.changeFrequency}</changefreq>` : "";
    const pri = e.priority != null ? `<priority>${e.priority}</priority>` : "";
    return `<url><loc>${e.url}</loc>${lastmod}${freq}${pri}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join("\n")}\n</urlset>`;
}

export async function GET() {
  const { full } = await buildSitemapEntries();
  return new Response(toXml(full), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
}
