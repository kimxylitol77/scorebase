import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { ALL_LEAGUES } from "@/lib/sports/sport-leagues";

// 자동 생성되는 sitemap.xml
// 검색 엔진(Google, 네이버 등)에 사이트 구조를 알려준다.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const now = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1.0 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/notices`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/predictions`, lastModified: now, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/previews`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    ...["SOCCER", "BASEBALL", "BASKETBALL", "HOCKEY", "ESPORTS"].map((sport) => ({
      url: `${base}/previews?sport=${sport}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.85,
    })),
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

  // 공지사항
  const notices = await prisma.notice.findMany({
    select: { slug: true, updatedAt: true, publishedAt: true },
  });
  const noticePages: MetadataRoute.Sitemap = notices.map((n) => ({
    url: `${base}/notices/${n.slug}`,
    lastModified: n.updatedAt ?? n.publishedAt ?? now,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // 라이브 매치 페이지 (최근 30일 종료 + 예정 14일 + 진행 중)
  const liveWindow = {
    past: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    future: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
  };
  const matches = await prisma.match.findMany({
    where: {
      league: { in: ALL_LEAGUES },
      startTime: { gte: liveWindow.past, lte: liveWindow.future },
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
      // 콜론(":") 포함 externalId 는 Next.js URL 라우팅이 매칭 못 함 (TheSports
      // 의 "ts:xxx" 패턴). sitemap 에 등록하면 검색엔진/봇이 404 만남 → 제외.
      NOT: { externalId: { contains: ":" } },
    },
    select: { league: true, externalId: true, status: true, startTime: true, updatedAt: true },
    orderBy: { startTime: "desc" },
    take: 5000,
  });

  const livePages: MetadataRoute.Sitemap = matches.map((m) => {
    const lg = m.league.toLowerCase();
    // MLB/KBO/NPB/LOL = 전용 라우트, 나머지(NBA/NHL/축구) = [league] 동적 라우트
    const slug = m.league === "LOL" ? "lol" : lg;
    const segment = ["mlb", "kbo", "npb", "lol"].includes(slug) ? slug : lg;
    return {
      url: `${base}/live/${segment}/${m.externalId}`,
      lastModified: m.updatedAt ?? m.startTime,
      changeFrequency: m.status === "LIVE" ? "hourly" : m.status === "SCHEDULED" ? "daily" : "weekly",
      priority: m.status === "LIVE" ? 0.85 : m.status === "SCHEDULED" ? 0.75 : 0.6,
    };
  });

  return [...staticPages, ...articlePages, ...noticePages, ...livePages];
}
