import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { ALL_LEAGUES, LOL_LEAGUES } from "@/lib/sports/sport-leagues";
import { finishedDatesKst } from "@/lib/sports/thesports/team-of-day";

// 자동 생성되는 sitemap.xml
// 검색 엔진(Google, 네이버 등)에 사이트 구조를 알려준다.
// 빌드 시점 정적 스냅샷이면 cron 발행 글(Article)·블로그가 다음 배포까지 누락 → 1시간 재생성
//
// lastmod 정책 (2026-07 감사 D6): 실제 변경 시점을 추적할 수 있는 URL 에만 기입하고
// 나머지는 생략한다. 생성 시각(now)을 일괄 기입하면 매시 전 URL 이 "방금 수정됨"이 되어
// Google 이 사이트 전체의 lastmod 신호를 무시하게 된다 — articles·blog 의 정확한 신호까지 죽음.
export const revalidate = 3600;

// sitemap 등록 리그 — 한국 검색수요 있는 핵심만. 나머지 ~120개 군소·해외 하부리그는
// thin 페이지라 크롤 예산·사이트 품질 신호를 희석(GSC "크롤링됨-색인안됨" 다수) → sitemap 제외.
// 페이지 자체는 /scores 등에서 살아있음(제외 ≠ 삭제). 2026-06-20 — 5/23 sitemap 청소 연장.
const SITEMAP_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "UCL", "UEL", "UECL",
  "MLS", "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA",
  "WORLD_CUP", "CLUB_WORLD_CUP",
  "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "AFC_CL", "SAUDI_PL",
  "NBA", "WNBA", "NHL",
  "MLB", "KBO", "NPB",
  "LOL", "LCK_CL",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE_URL;
  const now = new Date();

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1.0 },
    { url: `${base}/landing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/ai-sports-prediction`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/notices`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/predictions`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/predictions/accuracy`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/predictions/scorecard`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/value-bets`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/analysis`, changeFrequency: "hourly", priority: 0.85 },
    { url: `${base}/standings`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/injuries`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/transfers`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/predictions/club-ranking`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/tools/kbo-win-probability`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools/mlb-win-probability`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools/npb-win-probability`, changeFrequency: "monthly", priority: 0.75 },
    { url: `${base}/previews`, changeFrequency: "hourly", priority: 0.9 },
    ...["SOCCER", "BASEBALL", "BASKETBALL", "HOCKEY", "ESPORTS"].map((sport) => ({
      url: `${base}/previews?sport=${sport}`,
      changeFrequency: "hourly" as const,
      priority: 0.85,
    })),
    ...SITEMAP_LEAGUES.map((lg) => ({
      url: `${base}/leagues/${lg}`,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...SITEMAP_LEAGUES.map((lg) => ({
      url: `${base}/predictions/${lg}`,
      changeFrequency: "hourly" as const,
      priority: 0.85,
    })),
    // 월드컵 허브 + 출전국 목록 (2026-06 신설 — 고아였던 national-teams/[id] 입구)
    { url: `${base}/world-cup`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/world-cup/team-of-day`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/national-teams`, changeFrequency: "daily", priority: 0.85 },
    // 월드컵 조별 통합 베스트11 (A~L, 12조) — 평점·순위 매일 갱신
    ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"].map((g) => ({
      url: `${base}/world-cup/best-xi/${g}`,
      changeFrequency: "daily" as const,
      priority: 0.85,
    })),
  ];

  // 월드컵 출전국 48개국 페이지 — 스쿼드·감독·일정 (대회 기간 검색 수요)
  const wcTeams = await prisma.team.findMany({
    where: { league: "WORLD_CUP" },
    select: { id: true },
  });
  const nationalTeamPages: MetadataRoute.Sitemap = wcTeams.map((t) => ({
    url: `${base}/national-teams/${t.id}`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // 월드컵 '오늘의 베스트 XI' 날짜별 페이지 — 최신일은 base(staticPages)에 이미 등록 + [date] 가
  // redirect 하므로 slice(1)로 과거일만. 과거일 평점은 확정 = 거의 불변(monthly).
  const todDates = await finishedDatesKst();
  const todDatePages: MetadataRoute.Sitemap = todDates.slice(1).map((d) => ({
    url: `${base}/world-cup/team-of-day/${d}`,
    lastModified: new Date(`${d}T23:59:59+09:00`), // 과거일 평점은 그 날짜에 확정
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // 상대전적(H2H) — 활발한 페어만 (5전 이상 + 최근 180일 내 맞대결 = KBO 전 페어·
  // MLB 동지구·유럽 라이벌전). 회복기 크롤 예산 고려해 상한 500 — 나머지는 on-demand 렌더.
  const h2hPairs = await prisma.$queryRaw<Array<{ a: number; b: number; last: Date }>>`
    SELECT LEAST("homeTeamId","awayTeamId") a, GREATEST("homeTeamId","awayTeamId") b, MAX("startTime") last
    FROM "Match" WHERE status = 'FINISHED'
    GROUP BY 1, 2
    HAVING COUNT(*) >= 5 AND MAX("startTime") > NOW() - INTERVAL '180 days'
    ORDER BY MAX("startTime") DESC
    LIMIT 500`;
  const h2hPages: MetadataRoute.Sitemap = h2hPairs.map((p) => ({
    url: `${base}/h2h/${p.a}-vs-${p.b}`,
    lastModified: p.last, // 마지막 맞대결 시점 = 실제 내용 변경 시점
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

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
    select: { id: true, updatedAt: true },
  });
  const playerPages: MetadataRoute.Sitemap = topPlayers.map((p) => ({
    url: `${base}/transfers/${p.id}`,
    lastModified: p.updatedAt, // 몸값 갱신 시점
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // 팀 스쿼드 몸값 (view=team) — "맨유 스쿼드" 류 팀 단위 검색 수요 타깃.
  // 시장가치 데이터 보유한 빅5 팀만 (빈 페이지 = thin 회피). + 팀 가치 랭킹 view.
  const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
  const mvTeamGroups = await prisma.playerMarketValue.groupBy({
    by: ["teamId"],
    where: { league: { in: BIG5 }, currentValue: { not: null }, teamId: { not: null } },
  });
  const mvTsIds = mvTeamGroups.map((g) => g.teamId).filter((x): x is string => !!x);
  const mvTsRows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", externalId: { in: mvTsIds } },
    select: { teamId: true, team: { select: { league: true } } },
  });
  const squadTeamIds = [...new Set(mvTsRows.filter((r) => BIG5.includes(r.team.league)).map((r) => r.teamId))];
  const squadPages: MetadataRoute.Sitemap = [
    { url: `${base}/transfers?view=squads`, changeFrequency: "daily", priority: 0.75 },
    // Next sitemap 빌더는 loc 를 이스케이프하지 않음 — raw "&" 는 invalid XML 이라 "&amp;" 직접 기입
    ...squadTeamIds.map((id) => ({
      url: `${base}/transfers?view=team&amp;team=${id}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];

  // 팀 페이지 — 검색노출 대부분을 차지하는 섹션인데 sitemap 0개였던 것 보강 (2026-07 감사 D7).
  // 최근 1년 내 경기가 있는 활성 팀만 등록 — 중복 row·휴면 팀 thin 회피.
  const TEAM_PAGE_LEAGUES = ["MLB", "KBO", "NPB", "NBA", "NHL", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
  const teamMatchRows = await prisma.match.findMany({
    where: {
      league: { in: TEAM_PAGE_LEAGUES },
      startTime: { gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) },
    },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const activeTeamIds = new Set<number>();
  for (const r of teamMatchRows) {
    activeTeamIds.add(r.homeTeamId);
    activeTeamIds.add(r.awayTeamId);
  }
  const teamPages: MetadataRoute.Sitemap = [...activeTeamIds].map((id) => ({
    url: `${base}/teams/${id}`,
    changeFrequency: "weekly" as const,
    priority: 0.75,
  }));

  return [...staticPages, ...nationalTeamPages, ...todDatePages, ...h2hPages, ...articlePages, ...noticePages, ...blogPages, ...livePages, ...playerPages, ...squadPages, ...teamPages];
}
