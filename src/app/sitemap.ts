import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

// 자동 생성되는 sitemap.xml
// 검색 엔진(Google, 네이버 등)에 사이트 구조를 알려준다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${base}/leagues/EPL`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/leagues/NBA`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/leagues/KBO`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/predictions`, lastModified: now, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/predictions/EPL`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/predictions/NBA`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/predictions/KBO`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
  ];

  // 발행된 글
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true, publishedAt: true, updatedAt: true },
  });

  const articlePages: MetadataRoute.Sitemap = articles.map((a) => ({
    url: `${base}/articles/${a.slug}`,
    lastModified: a.updatedAt ?? a.publishedAt ?? now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...articlePages];
}
