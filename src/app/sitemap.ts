import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { ALL_LEAGUES, LOL_LEAGUES } from "@/lib/sports/sport-leagues";

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
    { url: `${base}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/predictions`, lastModified: now, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/predictions/accuracy`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/value-bets`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/analysis`, lastModified: now, changeFrequency: "hourly", priority: 0.85 },
    { url: `${base}/standings`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/injuries`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/transfers`, lastModified: now, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/predictions/club-ranking`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/predictions/top-scorers`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
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

  // 발행된 글 — 최근 60일만 (Google 색인 quota 우선순위).
  // PREVIEW + RECAP 은 AI 자동 발행 = scaled content abuse 회피 위해 sitemap 제외.
  // article page 자체에도 robots noindex 적용됨 (이중 차단).
  const articleHorizon = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      type: { notIn: ["PREVIEW", "RECAP"] },
      OR: [
        { publishedAt: { gte: articleHorizon } },
        { updatedAt: { gte: articleHorizon } },
      ],
    },
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

  // 블로그 글 — SEO 키워드 타깃 수동 작성(AI 자동 발행 아님) → 전체 포함.
  const blogs = await prisma.blog.findMany({
    select: { slug: true, updatedAt: true, publishedAt: true },
  });
  const blogPages: MetadataRoute.Sitemap = blogs.map((b) => ({
    url: `${base}/blog/${b.slug}`,
    lastModified: b.updatedAt ?? b.publishedAt ?? now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // 라이브 매치 페이지 — 예정 7일 + 진행 중만 (종료 매치 제외).
  // 종료 매치는 thin 이라 Google 이 색인 거부(크롤링됨-색인안됨/중복) → sitemap 품질 저하.
  // 페이지 자체는 DB 에 남아 회원/방문자가 계속 접근 가능 (sitemap 제외 ≠ 페이지 삭제).
  // 2026-05-29: GSC Coverage 진단 — /live 2294개(86%) thin 종료매치 과다로 제외.
  const liveWindow = {
    past: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // LIVE(자정 넘긴 경기)만 커버
    future: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
  };
  const matches = await prisma.match.findMany({
    where: {
      league: { in: ALL_LEAGUES },
      startTime: { gte: liveWindow.past, lte: liveWindow.future },
      status: { in: ["SCHEDULED", "LIVE"] },
      // 라우팅 불가 externalId 제외 (sitemap 등록 시 검색엔진/봇이 404 만남):
      // - 콜론(":") 포함 = Next.js URL 라우팅이 매칭 못 함 (TheSports "ts:xxx")
      // - 야구(KBO/MLB/NPB) ts- 매치 = 라이브 라우트가 숫자 id(api-sports/ESPN)
      //   전용(^\d+$ 가드)이라 TheSports 매치는 404 → 제외 (2026-05-30 route-guardian).
      NOT: [
        { externalId: { contains: ":" } },
        {
          AND: [
            { league: { in: ["KBO", "MLB", "NPB"] } },
            { externalId: { startsWith: "ts-" } },
          ],
        },
      ],
    },
    select: { id: true, league: true, externalId: true, status: true, startTime: true, updatedAt: true },
    orderBy: { startTime: "desc" },
    take: 2500,
  });

  const livePages: MetadataRoute.Sitemap = matches.map((m) => {
    const lg = m.league.toLowerCase();
    // MLB/KBO/NPB/LOL = 전용 라우트, 나머지(NBA/NHL/축구) = [league] 동적 라우트
    const slug = LOL_LEAGUES.has(m.league) ? "lol" : lg;
    const segment = ["mlb", "kbo", "npb", "lol"].includes(slug) ? slug : lg;
    // UFC 라우트는 Match.id(숫자) 기반 — externalId(hash)는 404 (2026-06-04 route-guardian).
    // /scores 내부링크와 동일하게 Match.id 로 sitemap 등록 (야구 ts- 제외와 다른 처리: UFC 는 전부 Match.id 라우팅).
    const routeId = m.league === "UFC" ? m.id : m.externalId;
    return {
      url: `${base}/live/${segment}/${routeId}`,
      lastModified: m.updatedAt ?? m.startTime,
      changeFrequency: m.status === "LIVE" ? "hourly" : m.status === "SCHEDULED" ? "daily" : "weekly",
      priority: m.status === "LIVE" ? 0.85 : m.status === "SCHEDULED" ? 0.75 : 0.6,
    };
  });

  // 선수 몸값 상세 — 가치 상위 600명(스타 = 콘텐츠 풍부 + 검색 수요). thin 회피로 상위만.
  const topPlayers = await prisma.playerMarketValue.findMany({
    where: { league: { in: ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"] }, currentValue: { not: null } },
    orderBy: { currentValue: "desc" },
    take: 600,
    select: { id: true },
  });
  const playerPages: MetadataRoute.Sitemap = topPlayers.map((p) => ({
    url: `${base}/transfers/${p.id}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticPages, ...articlePages, ...noticePages, ...blogPages, ...livePages, ...playerPages];
}
