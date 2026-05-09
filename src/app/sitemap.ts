import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

// 자동 생성되는 sitemap.xml
// 검색 엔진(Google, 네이버 등)에 사이트 구조를 알려준다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.SITE_URL ?? "http://localhost:3000";
  const now = new Date();

  const ALL_LEAGUES = [
    "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
    "NBA", "NHL", "MLB", "KBO",
  ];

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/predictions`, lastModified: now, changeFrequency: "hourly", priority: 0.95 },
    ...ALL_LEAGUES.map((lg) => ({
      url: `${base}/leagues/${lg}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...ALL_LEAGUES.map((lg) => ({
      url: `${base}/predictions/${lg}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.85,
    })),
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
