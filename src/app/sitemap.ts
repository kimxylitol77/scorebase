import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { ALL_LEAGUES, LOL_LEAGUES } from "@/lib/sports/sport-leagues";
import { EN_PREDICTION_LEAGUES, EN_STANDINGS_LEAGUE_SET } from "@/lib/i18n/en";
import { finishedDatesKst } from "@/lib/sports/thesports/team-of-day";
import { getAllLeaguesOverUnder } from "@/lib/stats/over-under";
import rawCanonical from "../../data/player-canonical-redirects.json";
import rawTeamCoaches from "../../data/team-coaches.json";
import rawCoachLegends from "../../data/coach-legends.json";

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

  // 오버/언더 집계 대상 리그 — 캐시된 집계라 sitemap 재생성(1h) 비용이 크지 않다.
  const overUnderLeagues = (await getAllLeaguesOverUnder()).map((l) => l.league);

  // 정적 페이지
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1.0 },
    { url: `${base}/landing`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/ai-sports-prediction`, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/k-league-cards`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/notices`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/blog`, changeFrequency: "weekly", priority: 0.6 },
    // 해외 뉴스 게시판 — 하루 여러 차례 발행되므로 blog 보다 갱신 빈도·우선순위가 높다
    { url: `${base}/news`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/predictions`, changeFrequency: "hourly", priority: 0.95 },
    { url: `${base}/predictions/accuracy`, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/predictions/scorecard`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/value-bets`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/analysis`, changeFrequency: "hourly", priority: 0.85 },
    { url: `${base}/standings`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/injuries/EPL`, changeFrequency: "daily", priority: 0.7 }, // /injuries 는 redirect 페이지 — 실대상 등록
    { url: `${base}/injuries/NATIONAL`, changeFrequency: "daily", priority: 0.65 }, // 국가대표(월드컵·예선·친선) 통합 부상자
    { url: `${base}/transfers`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/soccer/korea`, changeFrequency: "daily", priority: 0.85 }, // 해외파 한국 선수 — "손흥민 기록" 류 검색 수요
    { url: `${base}/rankings/ufc`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/rankings/value-clubs`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/predictions/club-ranking`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/predictions/fifa-ranking`, changeFrequency: "weekly", priority: 0.75 }, // "FIFA 랭킹" 검색 수요
    { url: `${base}/predictions/fifa-ranking-women`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${base}/tools/kbo-win-probability`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools/mlb-win-probability`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/tools/npb-win-probability`, changeFrequency: "monthly", priority: 0.75 },
    // 미니게임 — 로그인 없이 도는 커리어 시뮬. /dream-team 은 로그인 벽 + sitemap 누락으로
    // 아무도 못 찾았다(회원 117명 중 팀 3개). 같은 실수를 반복하지 않으려고 등록한다.
    { url: `${base}/career`, changeFrequency: "monthly", priority: 0.7 },
    // 종목 허브 — 5/23 sitemap 청소 이후 신설돼 등록 누락됐던 페이지들 (빙 실측: /baseball
    // 노출 3,127 인데 sitemap 밖 → 크롤 신호 손해). 2026-08-18 추가.
    { url: `${base}/soccer`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/baseball`, changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/basketball`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/hockey`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/previews`, changeFrequency: "hourly", priority: 0.9 },
    ...["SOCCER", "BASEBALL", "BASKETBALL", "HOCKEY", "ESPORTS"].map((sport) => ({
      url: `${base}/previews?sport=${sport}`,
      changeFrequency: "hourly" as const,
      priority: 0.85,
    })),
    // 야구 리그별 경기 분석 랜딩 — "npb경기분석" 류 리그 단위 검색의 착지점.
    ...["KBO", "MLB", "NPB"].map((lg) => ({
      url: `${base}/previews/${lg}`,
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
    // 오버/언더 통계 — 집계 대상 리그를 전부 등록한다(2026-08-22 사용자 결정).
    // 위 SITEMAP_LEAGUES 의 하부리그 제외 정책에 대한 예외다. 그 정책은 순위표처럼
    // 내용이 비는 thin 페이지를 겨냥한 것이고, 이 페이지들은 리그마다 팀별 표(오버 1.5·2.5·3.5,
    // 양팀 득점, 홈/원정 분해)와 분포 차트가 채워져 있어 해당하지 않는다.
    // 대상 자체가 "팀당 8경기 이상 · 컵/친선 제외" 필터를 통과한 리그라 빈 페이지가 끼지 않는다.
    { url: `${base}/over-under`, changeFrequency: "daily", priority: 0.8 },
    ...overUnderLeagues.map((lg) => ({
      url: `${base}/over-under/${lg}`,
      changeFrequency: "daily" as const,
      priority: SITEMAP_LEAGUES.includes(lg) ? 0.75 : 0.6,
    })),
    // 영어판(/en) — 핵심 URL 만 등록 (thin 희석 방지: 허브 + 핵심 리그 상세만)
    { url: `${base}/en`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/en/benchmark`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/en/benchmark/method`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/en/scores`, changeFrequency: "hourly", priority: 0.65 },
    { url: `${base}/en/standings`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/en/predictions`, changeFrequency: "daily", priority: 0.65 },
    { url: `${base}/en/predictions/accuracy`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/en/predictions/scorecard`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/en/injuries/EPL`, changeFrequency: "daily", priority: 0.55 },
    { url: `${base}/en/transfers`, changeFrequency: "daily", priority: 0.6 },
    // 영어판 연봉·상금 랭킹 (2026-08 en-mirror 로 생성) — KBO 는 한글 원본뿐이라 제외
    ...["soccer", "mlb", "nba", "nhl", "f1", "tennis", "golf"].map((sp) => ({
      url: `${base}/en/salaries/${sp}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    // 영어판 랭킹
    ...["f1", "tennis", "ufc", "value-clubs"].map((r) => ({
      url: `${base}/en/rankings/${r}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    { url: `${base}/en/over-under`, changeFrequency: "daily", priority: 0.65 },
    // 오버/언더 리그 상세는 핵심 리그만 — thin 희석 방지(한국어판은 94개 전체 등재)
    ...SITEMAP_LEAGUES.map((lg) => ({
      url: `${base}/en/over-under/${lg}`,
      changeFrequency: "daily" as const,
      priority: 0.55,
    })),
    { url: `${base}/en/predictions/club-ranking`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/en/predictions/title-race`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/en/national-teams`, changeFrequency: "weekly", priority: 0.55 },
    ...SITEMAP_LEAGUES.filter((lg) => EN_STANDINGS_LEAGUE_SET.has(lg)).map((lg) => ({
      url: `${base}/en/standings/${lg}`,
      changeFrequency: "daily" as const,
      priority: 0.55,
    })),
    ...EN_PREDICTION_LEAGUES.map((lg) => ({
      url: `${base}/en/predictions/${lg}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
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
  const nationalTeamPages: MetadataRoute.Sitemap = wcTeams.flatMap((t) => [
    {
      url: `${base}/national-teams/${t.id}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
    // 영어판(2026-08 en-mirror) — 허브에서 링크되는 48개국 상세.
    // 감독 페이지(/en/coaches)는 경력 데이터가 한글 전용이라 섹션이 빠져 한국어판보다 얇아 제외.
    {
      url: `${base}/en/national-teams/${t.id}`,
      changeFrequency: "daily" as const,
      priority: 0.5,
    },
  ]);

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
  //
  // PREVIEW + RECAP(AI 자동 발행)은 **경기 D-7 ~ D+2 창 안에서만** 포함한다.
  // articles/[slug] 의 robots 시간창과 반드시 같은 기준 — 색인 허용인데 sitemap 에 없으면
  // 발견이 늦고, 반대면 noindex 를 sitemap 이 광고하는 꼴이 된다. (2026-07-17, 배경은
  // articles/[slug]/page.tsx 의 주석 참조: 5/21 붕괴 → 전면 noindex → 회복 경로 차단)
  const articleHorizon = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const autoWindowStart = new Date(now.getTime() - 2 * 24 * 3600 * 1000); // 경기가 2일 전까지
  const autoWindowEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000); // 경기가 7일 후까지
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        // 사람/양질 글 — 기존 60일 기준 유지
        {
          type: { notIn: ["PREVIEW", "RECAP"] },
          OR: [
            { publishedAt: { gte: articleHorizon } },
            { updatedAt: { gte: articleHorizon } },
          ],
        },
        // 자동글 — 경기 시점이 색인 창 안일 때만
        {
          type: { in: ["PREVIEW", "RECAP"] },
          match: { startTime: { gte: autoWindowStart, lte: autoWindowEnd } },
        },
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
    // MLB/KBO/NPB/LOL/UFC = 소문자 전용 라우트, 나머지(NBA/NHL/축구) = [league] 동적 라우트.
    // 동적 라우트는 canonical·내부링크가 대문자(m.league) — sitemap 만 소문자면 신호가 갈려
    // 빙/구글이 두 벌을 따로 색인 (2026-07-05 Bing page stats 실측) → 대문자로 통일.
    const slug = LOL_LEAGUES.has(m.league) ? "lol" : lg;
    const segment = ["mlb", "kbo", "npb", "lol", "ufc"].includes(slug) ? slug : m.league;
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

  // 선수 몸값 상세 — 리그 판명 + 몸값 보유 선수 전원(~4,100명, MLS·사우디·K리그1 포함).
  // 기존 빅5 상위 600 한정은 손흥민(MLS) 등 검색 수요 최상위가 sitemap 에 0건이던 원인(2026-08-08 실측).
  // league null(약 1만 명)은 페이지 데이터 빈약(thin) 위험으로 계속 제외. take 는 안전 상한.
  // 유령(중복) id 는 정본으로 308 이동하므로 sitemap 에서 뺀다 — 넣으면 "리디렉션이 포함된
  //  페이지" 가 된다. 다만 그냥 빼면 정본이 league null 이라 원래 조건에 안 걸리는 선수가
  //  통째로 사라진다(실측 32명, 22명은 경력표 보유라 thin 아님) → 정본은 league 무관하게 포함.
  const CANONICAL = rawCanonical as Record<string, string>;
  const GHOST_IDS = new Set(Object.keys(CANONICAL));
  const CANON_IDS = [...new Set(Object.values(CANONICAL))];
  const topPlayers = await prisma.playerMarketValue.findMany({
    where: {
      currentValue: { not: null },
      OR: [{ league: { not: null } }, { id: { in: CANON_IDS } }],
    },
    orderBy: { currentValue: "desc" },
    take: 5300, // 정본 보충분(최대 ~230)만큼 상한 여유
    select: { id: true, updatedAt: true },
  });
  const playerPages: MetadataRoute.Sitemap = topPlayers.filter((p) => !GHOST_IDS.has(p.id)).map((p) => ({
    url: `${base}/transfers/${p.id}`,
    lastModified: p.updatedAt, // 몸값 갱신 시점
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  // 감독 페이지 — 현직(team-coaches, ts coach id 보유) + 레전드 레지스트리. 경력·우승·전술
  // 아카이브 데이터가 쌓여 있는데 sitemap 0개였던 것 보강 (2026-08-20, 빙 노출 2페이지뿐).
  const coachIds = new Set<string>([
    ...Object.values(rawTeamCoaches as Record<string, { id?: string }>)
      .map((c) => c.id)
      .filter((x): x is string => !!x),
    ...Object.keys(rawCoachLegends as Record<string, unknown>),
  ]);
  const coachPages: MetadataRoute.Sitemap = [...coachIds].map((id) => ({
    url: `${base}/coaches/${id}`,
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

  // UFC 파이터 상세 — 전적·체급 데이터 있는 파이터만 (thin 회피). id = teamId.
  const ufcFighters = await prisma.mmaFighter.findMany({
    where: { OR: [{ record: { not: null } }, { category: { not: null } }] },
    select: { teamId: true, updatedAt: true },
  });
  const ufcFighterPages: MetadataRoute.Sitemap = ufcFighters.map((f) => ({
    url: `${base}/ufc/fighters/${f.teamId}`,
    lastModified: f.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.55,
  }));

  // 야구 선수 상세 — 시즌 스탯·리더보드 등재 선수만 (데이터 없는 2군·육성 pid thin 회피).
  //  MLB 는 bare URL 이 정본(canonical), KBO/NPB 는 ?league= 로 구분.
  const [bbStats, bbLeaders] = await Promise.all([
    prisma.baseballPlayerSeasonStats.findMany({
      where: { externalId: { not: null }, league: { in: ["MLB", "KBO", "NPB"] } },
      distinct: ["externalId", "league"],
      select: { league: true, externalId: true },
    }),
    prisma.leagueLeader.findMany({
      where: { externalId: { not: null }, league: { in: ["MLB", "KBO", "NPB"] } },
      distinct: ["externalId", "league"],
      select: { league: true, externalId: true },
    }),
  ]);
  const bbSeen = new Set<string>();
  const baseballPlayerPages: MetadataRoute.Sitemap = [];
  for (const r of [...bbStats, ...bbLeaders]) {
    if (!r.externalId) continue;
    const key = `${r.league}:${r.externalId}`;
    if (bbSeen.has(key)) continue;
    bbSeen.add(key);
    baseballPlayerPages.push({
      url: r.league === "MLB" ? `${base}/players/${r.externalId}` : `${base}/players/${r.externalId}?league=${r.league}`,
      changeFrequency: "weekly" as const,
      priority: 0.55,
    });
  }

  // 영어판 선수 페이지 — MLB 만. KBO/NPB 는 선수명·팀명이 한국어 원본뿐이라 /en 에서 404 다.
  const enBaseballPlayerPages: MetadataRoute.Sitemap = [];
  for (const key of bbSeen) {
    const [league, externalId] = key.split(":");
    if (league !== "MLB") continue;
    enBaseballPlayerPages.push({
      url: `${base}/en/players/${externalId}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    });
  }

  return [...staticPages, ...nationalTeamPages, ...todDatePages, ...h2hPages, ...articlePages, ...noticePages, ...blogPages, ...livePages, ...playerPages, ...coachPages, ...squadPages, ...teamPages, ...ufcFighterPages, ...baseballPlayerPages, ...enBaseballPlayerPages];
}
