// sportspredictions.live sitemap — 정적 페이지 + 리그 13 + 향후 7일 경기. middleware 가 /sitemap.xml 을 여기로 rewrite.
import { fetchUpcoming } from "@/lib/sp/data";
import { SP_LEAGUES } from "@/lib/sp/leagues";
import { spUrl } from "@/lib/sp/site";

export const revalidate = 3600;

export async function GET() {
  const upcoming = await fetchUpcoming({ hours: 24 * 7, take: 300 });
  const urls: { loc: string; changefreq: string; priority: string }[] = [
    { loc: spUrl("/"), changefreq: "hourly", priority: "1.0" },
    { loc: spUrl("/accuracy"), changefreq: "daily", priority: "0.9" },
    { loc: spUrl("/methodology"), changefreq: "monthly", priority: "0.5" },
    { loc: spUrl("/about"), changefreq: "monthly", priority: "0.3" },
    ...SP_LEAGUES.map((l) => ({ loc: spUrl(`/${l.slug}`), changefreq: "hourly", priority: "0.8" })),
    ...upcoming.map((m) => ({ loc: spUrl(`/match/${m.id}`), changefreq: "hourly", priority: "0.6" })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
