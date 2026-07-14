// PREVIEW/RECAP/ANALYSIS 글 상세 — 본문 + AiDisclosure + ExternalSources + JSON-LD.
import { prisma } from "@/lib/db";
import Image from "next/image";
import Markdown from "@/components/Markdown";
import InningScoreChart from "@/components/InningScoreChart";
import type { InningProb } from "@/lib/predict/baseball-poisson";
import LeagueBadge from "@/components/LeagueBadge";
import MatchInsight from "@/components/MatchInsight";
import MatchVoteCard from "@/components/MatchVoteCard";
import InjuryAndKeyPlayers from "@/components/InjuryAndKeyPlayers";
import RelatedArticles from "@/components/RelatedArticles";
import AiConsensusWidget from "@/components/AiConsensusWidget";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { formatDateKo } from "@/lib/format";
import { getExternalLinks } from "@/lib/external-links";
import AdminEditLink from "@/components/AdminEditLink";
import { SITE_URL } from "@/lib/site-url";
import { toKoreanTeamName } from "@/lib/team-names";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { buildSoccerCacheTabs, type SoccerInsightTab } from "@/components/scores/soccer/buildSoccerCacheTabs";
import teamIdMapping from "@/lib/sports/thesports/team-id-mapping.json";
import TeamOfDayPitch from "@/components/TeamOfDayPitch";
import { getTeamOfDay, parseXiTableNames, TOD_ARTICLE_SLUG_PREFIX } from "@/lib/sports/thesports/team-of-day";
import { parseStarSlug } from "@/lib/sports/thesports/wc-star-report";
import { playerOverrideNameKo } from "@/lib/sports/thesports/world-cup-player-stats";
import { parseMvpMarker, stripMvpMarker, MLB_WEEKLY_SLUG_PREFIX } from "@/lib/sports/baseball/mlb-weekly-players";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import AmbientGlow from "@/components/AmbientGlow";
import { BarChart3, CalendarDays, Activity, Star, Swords } from "lucide-react";

// ISR — 발행된 글 본문은 거의 불변. 10분 캐시로 페이지 이동 가속(새 글 첫 방문은 즉시 생성).
export const revalidate = 600;

interface Props {
  params: Promise<{ slug: string }>;
}

const BADGE_CLS =
  "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10";

const TYPE_BADGE: Record<
  string,
  { label: string; cls: string; icon?: React.ReactNode }
> = {
  PREVIEW: { label: "프리뷰", cls: BADGE_CLS },
  RECAP: { label: "리뷰", cls: BADGE_CLS },
  ANALYSIS: { label: "분석", icon: <BarChart3 className="h-3.5 w-3.5" aria-hidden />, cls: BADGE_CLS },
  TACTICAL: { label: "전술", icon: <Swords className="h-3.5 w-3.5" aria-hidden />, cls: BADGE_CLS },
};

const SITE_NAME = process.env.SITE_NAME ?? "Scorebase";

/**
 * 본문 마크다운에서 검색·소셜 미리보기용 description 생성.
 *
 * SportsEvent JSON-LD 의 description 권장 길이는 200~500자 (Google Rich Results
 * 가이드). 너무 짧으면 검증 reject 가능. NewsArticle 의 메타 description 도
 * 같이 쓰므로 280자 정도가 SERP·SNS 미리보기·Rich Results 모두 만족.
 *
 * 마지막 한 글자 단위 cut 이 단어 잘림을 만드는 경우가 있어 문장 부호 직후로 한정.
 */
function makeDescription(content: string): string {
  const flat = content
    .replace(/<!--[\s\S]*?-->/g, "") // HTML 주석(예: MVP 카드 마커) 제거
    .replace(/[#*_`>[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= 280) return flat;
  // 280자 이내에서 마지막 문장 종결 부호 우선 cut
  const slice = flat.slice(0, 280);
  const lastSentenceEnd = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("? "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("다. "),
    slice.lastIndexOf("다."),
  );
  if (lastSentenceEnd >= 200) return slice.slice(0, lastSentenceEnd + 1);
  // 종결 부호 없으면 띄어쓰기에서 cut
  const lastSpace = slice.lastIndexOf(" ");
  return lastSpace >= 200 ? slice.slice(0, lastSpace) + "…" : slice + "…";
}

/** 본문에서 "ID(Eng, 한글)" 패턴의 선수 ID·본명 추출. 최대 maxPick개. */
function extractLolPlayerMentions(
  content: string,
  maxPick = 6,
): Array<{ id: string; nameKo?: string }> {
  // 패턴: "페이커(Faker, 이상혁)" 또는 "Faker(Lee Sang-hyeok, 이상혁)" 또는 "Zeus(최우제)"
  // 첫 등장만 잡으면 충분.
  const re = /([A-Za-z][A-Za-z0-9.]{1,20})\s*\(([^)]+)\)/g;
  const seen = new Map<string, string | undefined>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const id = m[1];
    const inner = m[2];
    // 한글 본명 추출
    const koMatch = inner.match(/([가-힣]{2,4})/);
    if (!seen.has(id)) {
      seen.set(id, koMatch ? koMatch[1] : undefined);
      if (seen.size >= maxPick) break;
    }
  }
  return [...seen.entries()].map(([id, nameKo]) => ({ id, nameKo }));
}

/** 본문에서 패치 버전(16.9.1 류 X.Y.Z) 추출. 첫 매치만. */
function extractLolPatch(content: string): string | undefined {
  const m = content.match(/\b(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\b/);
  return m ? m[1] : undefined;
}

const LCK_LEAGUES = new Set(["LOL", "LCK"]);
// 우리 Team.id → TheSports team_id (축구 매치 탭의 H2H·팀통계 home/away 판별)
const TEAM_ID_MAP = new Map<number, string>(
  (teamIdMapping as Array<{ ourId: number; tsId: string }>).map((t) => [t.ourId, t.tsId]),
);

interface LolMetaInput {
  homeName: string;
  awayName: string;
  startTime: Date;
  content: string;
  type: "PREVIEW" | "RECAP" | "ANALYSIS";
  homeScore: number | null;
  awayScore: number | null;
  /** URL slug — type 외 추가 분기 단서 (lol-recap-* / lol-preview-*) */
  slug: string;
}

function buildLolMetadata(opts: LolMetaInput): { description: string; keywords: string[] } {
  const { homeName, awayName, startTime, content, type, homeScore, awayScore, slug } = opts;
  const patch = extractLolPatch(content);
  const players = extractLolPlayerMentions(content);
  const dateStr = startTime.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  });

  // type + slug 둘 중 어느 하나라도 RECAP 신호면 RECAP 분기.
  // (DB type 누락 케이스 + 캐시 안전 둘 다 대응)
  const isRecap = type === "RECAP" || slug.startsWith("lol-recap");

  if (isRecap) {
    // RECAP — 끝난 매치 리뷰
    const scoreStr =
      homeScore != null && awayScore != null
        ? `${homeScore}-${awayScore}`
        : "결과";
    const description = `${homeName} ${scoreStr} ${awayName} — ${dateStr} LCK 매치 리뷰. 게임별 MVP, 결정적 순간 타임라인, 시즌 함의 분석. 스코어베이스.`;
    const keywords = [
      "LCK 리뷰",
      "LCK 결과",
      "LCK 매치 리뷰",
      `${homeName} vs ${awayName}`,
      `${homeName} 경기 결과`,
      `${awayName} 경기 결과`,
      "LCK MVP",
      "롤 매치 분석",
      "LoL 결과",
      ...players.flatMap((p) => [p.id, ...(p.nameKo ? [p.nameKo] : [])]),
      "스코어베이스",
      "Scorebase",
    ];
    return { description, keywords };
  }

  // PREVIEW (default)
  const patchPart = patch ? `${patch} 패치 메타 분석, ` : "";
  const description = `${homeName} vs ${awayName} — ${dateStr} LCK 매치 프리뷰. ${patchPart}5라인 매치업, 모델 승률 추정. 스코어베이스.`;
  const keywords = [
    "LCK",
    "LCK 일정",
    "LCK 예측",
    `${homeName} vs ${awayName}`,
    homeName,
    awayName,
    "롤",
    "리그 오브 레전드",
    "롤 e스포츠 분석",
    "롤드컵",
    "LCK 프리뷰",
    "LCK 매치업",
    ...players.flatMap((p) => [p.id, ...(p.nameKo ? [p.nameKo] : [])]),
  ];
  return { description, keywords };
}

// 종목별 평균 매치 시간 (분) — endDate 추정용
const MATCH_DURATION_MIN: Record<string, number> = {
  EPL: 110, LALIGA: 110, BUNDESLIGA: 110, SERIE_A: 110,
  LIGUE_1: 110, MLS: 110, UCL: 110, WORLD_CUP: 120,
  NBA: 150, NHL: 150,
  MLB: 180, KBO: 200, NPB: 200,
  LOL: 180, // BO3 시리즈 평균 약 3시간 (Bo5는 더 길지만 정규시즌은 Bo3)
};

// 리그별 country/city 매핑 + location 빌더는 공통 helper 로 이동.
import { LEAGUE_COUNTRY, buildSportsEventLocation } from "@/lib/seo/sports-event-location";

interface MatchForEvent {
  homeTeam: { name: string };
  awayTeam: { name: string };
  startTime: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  raw?: string | null;
}

function buildSportsEventJsonLd(opts: {
  match: MatchForEvent;
  league: string;
  articleTitle: string;
  description: string;
  url: string;
  siteUrl: string;
}) {
  const { match, league, articleTitle, description, url, siteUrl } = opts;
  const home = match.homeTeam.name;
  const away = match.awayTeam.name;
  const start = match.startTime;
  const durationMin = MATCH_DURATION_MIN[league] ?? 120;
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  const country = LEAGUE_COUNTRY[league];

  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home} vs ${away}`,
    description,
    url,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    eventStatus:
      match.status === "FINISHED"
        ? "https://schema.org/EventCompleted"
        : match.status === "POSTPONED"
          ? "https://schema.org/EventPostponed"
          : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    sport: league,
    location: buildSportsEventLocation({ league, homeName: home, rawMatch: match.raw }),
    homeTeam: { "@type": "SportsTeam", name: home },
    awayTeam: { "@type": "SportsTeam", name: away },
    competitor: [
      { "@type": "SportsTeam", name: home },
      { "@type": "SportsTeam", name: away },
    ],
    performer: [
      { "@type": "SportsTeam", name: home },
      { "@type": "SportsTeam", name: away },
    ],
    image: [`${siteUrl}/og-image.png`],
    organizer: {
      "@type": "Organization",
      name: country?.name ? `${league} (${country.name})` : league,
      url: `${siteUrl}/leagues/${league}`,
    },
    offers: {
      "@type": "Offer",
      url,
      price: "0",
      priceCurrency: "KRW",
      availability: "https://schema.org/InStock",
      validFrom: start.toISOString(),
      category: "free analysis",
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = await prisma.article.findUnique({
    where: { slug },
    select: {
      title: true,
      content: true,
      league: true,
      type: true,
      publishedAt: true,
      match: {
        select: {
          startTime: true,
          homeScore: true,
          awayScore: true,
          homeStarter: true,
          awayStarter: true,
          predHome: true,
          predAway: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
  });
  if (!article) return { title: "기사를 찾을 수 없습니다" };

  // MLB 주간 베스트 선수 글의 MVP 카드 마커가 meta description 으로 새지 않게 제거.
  if (slug.startsWith(MLB_WEEKLY_SLUG_PREFIX)) article.content = stripMvpMarker(article.content);

  const url = `${SITE_URL}/articles/${slug}`;
  const isLol = LCK_LEAGUES.has(article.league);
  const isBaseball =
    article.league === "KBO" ||
    article.league === "MLB" ||
    article.league === "NPB";

  // LoL 분기 — keywords 풍부화 + description 명시 패턴 (PREVIEW vs RECAP)
  let desc: string;
  let keywords: string[] | undefined;
  if (isLol && article.match) {
    const lolMeta = buildLolMetadata({
      homeName: toKoreanTeamName(article.match.homeTeam.name, article.league),
      awayName: toKoreanTeamName(article.match.awayTeam.name, article.league),
      startTime: article.match.startTime,
      content: article.content,
      type: article.type as "PREVIEW" | "RECAP" | "ANALYSIS",
      homeScore: article.match.homeScore,
      awayScore: article.match.awayScore,
      slug,
    });
    desc = lolMeta.description;
    keywords = lolMeta.keywords;
  } else if (isBaseball && article.match) {
    // 야구 KBO/MLB/NPB — recap/preview 분기 + starter 이름 키워드
    desc = makeDescription(article.content);
    const homeName = toKoreanTeamName(article.match.homeTeam.name, article.league);
    const awayName = toKoreanTeamName(article.match.awayTeam.name, article.league);
    const isKbo = article.league === "KBO";
    const isMlb = article.league === "MLB";
    const isRecap = slug.includes("-recap-");
    const baseKeywords = isRecap
      ? [
          `${homeName} vs ${awayName}`,
          `${homeName} 경기 결과`,
          `${awayName} 경기 결과`,
          `${article.league} 리뷰`,
          `${article.league} 결과`,
          isKbo ? "프로야구 결과" : isMlb ? "MLB 결과" : "NPB 결과",
        ]
      : [
          `${homeName} vs ${awayName} 예측`,
          `${homeName} 선발 투수`,
          `${awayName} 선발 투수`,
          `${article.league} 프리뷰`,
          `${article.league} 예측`,
          isKbo ? "오늘 프로야구" : isMlb ? "오늘 MLB" : "오늘 NPB",
        ];
    const starterNames: string[] = [];
    for (const raw of [article.match.homeStarter, article.match.awayStarter]) {
      if (!raw) continue;
      try {
        const j = JSON.parse(raw) as { name?: string };
        if (j.name) starterNames.push(`${j.name} 등판`);
      } catch {}
    }
    keywords = [
      ...baseKeywords,
      ...starterNames,
      "야구 분석",
      "스코어베이스",
      "Scorebase",
    ];
  } else {
    desc = makeDescription(article.content);
  }

  // === SERP/OG 용 제목·설명 합성 ===
  // DB 의 AI 제목은 에세이형("…홈 성적 vs 원정 강도 — 중요한 대결")이라 검색결과에서
  // 잘리고 가치(선발·승률·스코어)가 안 보인다 (2026-05 허니문 CTR 0.30% 원인 중 하나).
  // 검색 intent("팀A vs 팀B")에 맞춰 렌더 시점에 합성 — 본문 h1 은 저장 제목 유지.
  let serpTitle: string | null = null;
  const m = article.match;
  if (m) {
    const homeKo = toKoreanTeamName(m.homeTeam.name, article.league);
    const awayKo = toKoreanTeamName(m.awayTeam.name, article.league);
    const kst = new Date(m.startTime.getTime() + 9 * 3600_000);
    const md = `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`;
    let starterPair: string | null = null;
    try {
      const hs = m.homeStarter ? (JSON.parse(m.homeStarter) as { name?: string }).name : null;
      const as = m.awayStarter ? (JSON.parse(m.awayStarter) as { name?: string }).name : null;
      if (hs && as) starterPair = `${hs} vs ${as}`;
    } catch {}

    if (article.type === "RECAP" && m.homeScore != null && m.awayScore != null) {
      serpTitle = `${homeKo} ${m.homeScore}-${m.awayScore} ${awayKo} — 경기 결과·분석 (${md})`;
      if (!isLol) {
        desc = `${md} ${article.league} ${homeKo} ${m.homeScore}-${m.awayScore} ${awayKo} 경기 결과. 승부처·키 플레이어·데이터로 보는 리뷰. 스코어베이스.`;
      }
    } else if (article.type === "PREVIEW") {
      const withStarters = starterPair
        ? `${homeKo} vs ${awayKo} 예측 — 선발 ${starterPair} (${md})`
        : null;
      serpTitle =
        withStarters && withStarters.length <= 58
          ? withStarters
          : `${homeKo} vs ${awayKo} 예측·선발 분석 (${md})`;
      if (!isLol) {
        const probs =
          m.predHome != null && m.predAway != null
            ? ` 모델 승률 ${homeKo} ${Math.round(m.predHome * 100)}%·${awayKo} ${Math.round(m.predAway * 100)}%.`
            : "";
        const starterDesc = starterPair ? ` 선발 ${starterPair}.` : "";
        desc = `${md} ${article.league} ${homeKo} vs ${awayKo} 프리뷰.${starterDesc}${probs} 최근 폼·맞대결·순위 데이터 분석. 스코어베이스.`;
      }
    }
  }
  const displayTitle = serpTitle ?? article.title;

  // PREVIEW + RECAP 은 AI 자동 발행 = Google scaled content abuse 회피 위해 noindex.
  // follow:true — 내부 link 권한은 흐르게. ANALYSIS / 기타 type 은 index 유지.
  const isAutoGenerated = article.type === "PREVIEW" || article.type === "RECAP";
  return {
    title: displayTitle,
    description: desc,
    ...(keywords ? { keywords } : {}),
    ...(isAutoGenerated && { robots: { index: false, follow: true } }),
    authors: [{ name: "스코어베이스 데이터 분석팀", url: SITE_URL }],
    alternates: { canonical: url },
    openGraph: {
      title: displayTitle,
      description: desc,
      url,
      type: "article",
      siteName: SITE_NAME,
      locale: "ko_KR",
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.publishedAt?.toISOString(),
      authors: ["스코어베이스 데이터 분석팀"],
      section: article.league,
    },
    twitter: {
      card: "summary_large_image",
      title: displayTitle,
      description: desc,
    },
    other: {
      "article:section": article.league,
      "article:author": "스코어베이스 데이터 분석팀",
    },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      match: { include: { homeTeam: true, awayTeam: true, theSportsCache: true } },
    },
  });

  if (!article || article.status !== "PUBLISHED") notFound();

  // MLB 주간 베스트 선수 글 — 상단 MVP 카드용 마커를 먼저 파싱하고 본문에서 제거.
  // 이후 desc·OG·Markdown 모두 마커 없는 본문을 쓰게 해 누수를 막는다.
  const mlbMvp = parseMvpMarker(article.slug, article.content);
  if (mlbMvp) article.content = stripMvpMarker(article.content);

  const date = formatDateKo(article.publishedAt ?? article.createdAt);
  const url = `${SITE_URL}/articles/${slug}`;
  const desc = makeDescription(article.content);

  // '오늘의 베스트 XI' 분석 글 — 본문 위에 그날 베스트11 피치 렌더 (slug 의 날짜로 재집계).
  // 본문 표(발행 시점 고정)의 11인을 파싱해 그래픽을 표와 동일 명단으로 고정 — 사후 평점
  // 정정으로 그래픽·표가 다른 11인이 되던 불일치 방지 (2026-07-02 감사 A9).
  const tod = article.slug.startsWith(TOD_ARTICLE_SLUG_PREFIX)
    ? await getTeamOfDay(
        article.slug.slice(TOD_ARTICLE_SLUG_PREFIX.length),
        parseXiTableNames(article.content),
      )
    : null;

  // STAR 리포트(선수 단독 글) — Person 구조화 데이터로 선수 엔티티 신호 강화.
  const star = parseStarSlug(article.slug);
  const starPlayer = star
    ? await prisma.theSportsPlayer.findUnique({
        where: { id: star.playerId },
        select: { name: true, nameKo: true, photoUrl: true },
      })
    : null;
  const starHasMv = star
    ? (await prisma.playerMarketValue.findUnique({ where: { id: star.playerId }, select: { id: true } })) != null
    : false;
  // 표시용 한글명 — 본문과 동일하게 override 우선. theSportsPlayer.nameKo 는 daily 봇이
  // TheSports 값으로 덮어 override(수동 교정)와 어긋날 수 있어(예: 엠바페 vs 음바페) 헤더가 틀렸음.
  const starNameKo = star
    ? playerOverrideNameKo(star.playerId) || starPlayer?.nameKo || null
    : null;
  const personJsonLd = star
    ? {
        "@context": "https://schema.org",
        "@type": "Person",
        name: starNameKo || starPlayer?.name || article.title,
        ...(starPlayer?.name ? { alternateName: starPlayer.name } : {}),
        ...(starPlayer?.photoUrl ? { image: starPlayer.photoUrl } : {}),
        jobTitle: "축구 선수",
        ...(starHasMv ? { url: `${SITE_URL}/transfers/${star.playerId}` } : {}),
        subjectOf: { "@type": "NewsArticle", "@id": url, name: article.title },
      }
    : null;

  // 축구 글 — TheSports 캐시 기반 탭(라인업·팀통계·모멘텀·하프타임·H2H) 주입 (live 페이지와 동등).
  let soccerTabs: SoccerInsightTab[] = [];
  if (article.match && SOCCER_LEAGUES.has(article.league) && article.match.theSportsCache) {
    const m = article.match;
    soccerTabs = await buildSoccerCacheTabs({
      cache: m.theSportsCache,
      status: m.status,
      homeKo: toKoreanTeamName(m.homeTeam.name, article.league),
      awayKo: toKoreanTeamName(m.awayTeam.name, article.league),
      homeTsId: TEAM_ID_MAP.get(m.homeTeam.id) ?? null,
      awayTsId: TEAM_ID_MAP.get(m.awayTeam.id) ?? null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    });
  }

  // LoL RECAP — 본문 안에 5라인 매치업·시즌·MVP 가 모두 들어있는 긴 Markdown 사용.
  // lolContext 는 디버깅용으로 DB 에 저장만 하고 페이지에서 카드로 렌더링하지 않는다.

  // JSON-LD 구조화 데이터 (NewsArticle / SportsEvent)
  // image: 글마다 다른 동적 OG (opengraph-image.tsx) 를 가리키게 변경 — Google News rich result 차별화.
  // author: publisher 와 분리해서 "분석팀"으로 명시 — 콘텐츠 가치 신호 강화.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: desc,
    image: [`${SITE_URL}/articles/${slug}/opengraph-image`],
    author: {
      "@type": "Organization",
      name: "스코어베이스 데이터 분석팀",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/og-image.png`,
      },
    },
    datePublished: (article.publishedAt ?? article.createdAt).toISOString(),
    dateModified: article.updatedAt.toISOString(),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: "ko-KR",
    articleSection: article.league,
    // 저작권 주체 명시 — 도용 시 권리자를 구조화 데이터로 못박는다(DMCA 근거).
    copyrightHolder: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    copyrightYear: (article.publishedAt ?? article.createdAt).getFullYear(),
  };

  const eventJsonLd = article.match
    ? buildSportsEventJsonLd({
        match: article.match,
        league: article.league,
        articleTitle: article.title,
        description: desc,
        url,
        siteUrl: SITE_URL,
      })
    : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Scorebase", item: SITE_URL },
      {
        "@type": "ListItem",
        position: 2,
        name: article.league,
        item: `${SITE_URL}/leagues/${article.league}`,
      },
      { "@type": "ListItem", position: 3, name: article.title, item: url },
    ],
  };

  return (
    <article className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {eventJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {personJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <Link
          href={`/leagues/${article.league}`}
          className="text-sm text-neutral-500 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white"
        >
          ← {article.league}
        </Link>
        <AdminEditLink articleId={article.id} />
      </div>

      <div className="flex items-center gap-2 text-sm mb-4 flex-wrap">
        <LeagueBadge league={article.league} size="md" />
        {(() => {
          const badge = TYPE_BADGE[article.type];
          return badge ? (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold ring-1 ring-inset text-xs ${badge.cls}`}
            >
              {badge.icon && <span>{badge.icon}</span>}
              {badge.label}
            </span>
          ) : (
            <span className="text-neutral-500 font-medium">{article.type}</span>
          );
        })()}
        <span className="text-neutral-500">{date}</span>
      </div>

      {tod && tod.xi.length > 0 && (
        <div className="mb-8 mx-auto max-w-md">
          <TeamOfDayPitch matches={tod.matches} xi={tod.xi} />
        </div>
      )}

      {/* STAR 리포트 — 선수 사진 히어로. photoUrl 은 위에서 이미 로드한 TheSportsPlayer 조회값. */}
      {star && starPlayer?.photoUrl && (
        <div className="mb-8 flex items-center gap-4 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-zinc-100 to-zinc-50 p-5 ring-1 ring-black/5 sm:gap-5 sm:rounded-[2rem] sm:p-6 dark:from-white/[0.06] dark:to-white/[0.02] dark:ring-white/10">
          <Image
            src={starPlayer.photoUrl}
            alt={starNameKo || starPlayer.name || "선수 사진"}
            width={128}
            height={128}
            className="h-24 w-24 shrink-0 rounded-2xl object-cover object-top ring-1 ring-black/5 sm:h-28 sm:w-28 dark:ring-white/10"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              STAR 리포트
            </div>
            <div className="mt-1 truncate text-lg font-bold text-zinc-900 sm:text-xl dark:text-white">
              {starNameKo || starPlayer.name}
            </div>
            {starNameKo && starPlayer.name && (
              <div className="truncate text-sm text-zinc-500 dark:text-white/50">{starPlayer.name}</div>
            )}
          </div>
        </div>
      )}

      {/* MLB 주간 베스트 선수 — 이주의 MVP 카드(클릭 시 선수 페이지). 축구 STAR 카드와 동형 + 링크. */}
      {mlbMvp && (
        <Link
          href={`/players/${mlbMvp.personId}`}
          className="group mb-8 flex items-center gap-4 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-zinc-100 to-zinc-50 p-5 ring-1 ring-black/5 transition-colors hover:ring-black/15 sm:gap-5 sm:rounded-[2rem] sm:p-6 dark:from-white/[0.06] dark:to-white/[0.02] dark:ring-white/10 dark:hover:ring-white/25"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mlbHeadshotUrl(mlbMvp.personId)}
            alt={mlbMvp.nameKo}
            width={112}
            height={112}
            className="h-24 w-24 shrink-0 rounded-2xl bg-zinc-200 object-contain ring-1 ring-black/5 sm:h-28 sm:w-28 dark:bg-white/10 dark:ring-white/10"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
              이주의 MVP
            </div>
            <div className="mt-1 truncate text-lg font-bold text-zinc-900 group-hover:underline sm:text-xl dark:text-white">
              {mlbMvp.nameKo}
            </div>
            {mlbMvp.nameEn && mlbMvp.nameEn !== mlbMvp.nameKo && (
              <div className="truncate text-sm text-zinc-500 dark:text-white/50">{mlbMvp.nameEn}</div>
            )}
            {mlbMvp.line && (
              <div className="mt-1 truncate text-xs font-medium text-zinc-600 tabular-nums dark:text-white/60">
                {mlbMvp.line}
              </div>
            )}
          </div>
        </Link>
      )}

      {article.match && (() => {
        const hs = article.match.homeScore;
        const as = article.match.awayScore;
        const matchStatus = article.match.status;
        const isFinished = matchStatus === "FINISHED";
        const isLive = matchStatus === "LIVE";
        const isPostponed = matchStatus === "POSTPONED";
        const hasScore = hs != null && as != null;

        // FT 는 "Full Time = 종료" — FINISHED 상태일 때만 표기.
        // LIVE 는 "진행 중", 그 외는 "예정" / "연기".
        let statusLabel: string;
        let scoreBadge: string;
        let boxTitle: string;
        if (isFinished && hasScore) {
          statusLabel = hs! > as! ? "홈 승" : hs! < as! ? "원정 승" : "무승부";
          scoreBadge = "FT";
          boxTitle = "Final Score";
        } else if (isLive) {
          statusLabel = "진행 중";
          scoreBadge = "LIVE";
          boxTitle = "Live";
        } else if (isPostponed) {
          statusLabel = "연기";
          scoreBadge = "연기";
          boxTitle = "Postponed";
        } else {
          statusLabel = "예정";
          scoreBadge = "예정";
          boxTitle = "Kickoff";
        }
        return (
          <div className="mb-8 overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-zinc-100 p-5 sm:p-7 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <div className="mb-5 flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500 dark:text-white/45">
              <span>{boxTitle}</span>
              <span>{statusLabel}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
              {/* 홈 팀 */}
              <Link
                href={`/teams/${article.match.homeTeam.id}`}
                className="group flex flex-col items-center text-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90"
              >
                <TeamLogo
                  src={article.match.homeTeam.logoUrl}
                  name={article.match.homeTeam.name}
                />
                <div className="mt-2 max-w-full truncate text-sm font-semibold group-hover:underline sm:text-base">
                  {toKoreanTeamName(article.match.homeTeam.name, article.league)}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-zinc-500 sm:text-xs dark:text-white/45">
                  홈
                </div>
              </Link>

              {/* 스코어 + 상태 배지 */}
              <div className="flex flex-col items-center gap-3">
                <div className="whitespace-nowrap text-4xl font-semibold tabular-nums tracking-tight text-zinc-950 sm:text-5xl dark:text-white">
                  {hs ?? "-"}
                  <span className="mx-2 text-zinc-400 sm:mx-3 dark:text-white/30">:</span>
                  {as ?? "-"}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-bold shadow-sm ring-1 ${
                    isLive
                      ? "bg-rose-500 text-white ring-rose-400/60 animate-pulse"
                      : "bg-white text-zinc-900 ring-black/5 dark:bg-white dark:text-black"
                  }`}
                >
                  {isLive && (
                    <span className="relative mr-1 inline-flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                    </span>
                  )}
                  {scoreBadge}
                </span>
              </div>

              {/* 원정 팀 */}
              <Link
                href={`/teams/${article.match.awayTeam.id}`}
                className="group flex flex-col items-center text-center transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-90"
              >
                <TeamLogo
                  src={article.match.awayTeam.logoUrl}
                  name={article.match.awayTeam.name}
                />
                <div className="mt-2 max-w-full truncate text-sm font-semibold group-hover:underline sm:text-base">
                  {toKoreanTeamName(article.match.awayTeam.name, article.league)}
                </div>
                <div className="mt-0.5 text-[10px] font-medium text-zinc-500 sm:text-xs dark:text-white/45">
                  원정
                </div>
              </Link>
            </div>
          </div>
        );
      })()}

      {/* LoL RECAP 본문은 길게 풀어쓴 Markdown (사용자 선호 — 카드 UI 대신 본문에 모든 정보 통합).
          lolRecapCtx 가 있어도 본문 안에 5라인 매치업·시즌·MVP 가 다 들어있으므로 Markdown 만. */}
      {article.match && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2 text-[12px] leading-relaxed text-amber-800 break-keep dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200/85">
          <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>이 분석은 <strong>{date} 발행 시점</strong>의 데이터 기준입니다. Elo·순위·선발 등은
          이후 갱신될 수 있어, 아래 실시간 위젯과 차이가 있을 수 있습니다.</span>
        </p>
      )}
      <Markdown>{article.content}</Markdown>

      {/* 데이터 출처 + 저작권 */}
      <AiDisclosure league={article.league} url={url} />

      {/* 참고 외부 출처 (공식 사이트·통계) */}
      <ExternalSources league={article.league} />

      {/* ⭐ 본문=위젯 단일 소스: 위젯 예측을 글(Article) 스냅샷으로 주입.
          Match.predHome 은 predict-match/evaluate/odds cron 이 수시 재계산·덮어써서
          본문(글 작성 시점 고정)과 벌어짐(예: 본문 76% vs 위젯 64%). 글 페이지에서는
          글이 보여주는 예측을 위젯도 그대로 쓰게 강제 → 한 화면 안 100% 일치.
          (article.pred* 없으면 Match 값 fallback) */}
      {article.match && <MatchVoteCard matchId={article.match.id} />}
      {article.match && (
        <MatchInsight
          match={{
            ...article.match,
            predHome: article.predHome ?? article.match.predHome,
            predDraw: article.predDraw ?? article.match.predDraw,
            predAway: article.predAway ?? article.match.predAway,
            predWinner: article.predWinner ?? article.match.predWinner,
            // Elo·시즌 승점도 글 스냅샷 주입 (predHome 과 동일 — 본문=위젯 일치).
            // Match 에 없는 값이라 article 값만, 없으면(기존 글) 위젯이 실시간 fallback.
            eloHome: article.eloHome,
            eloAway: article.eloAway,
            homeSeasonPoints: article.homeSeasonPoints,
            awaySeasonPoints: article.awaySeasonPoints,
          }}
          extraTabs={soccerTabs}
        />
      )}

      {/* H2H 상대전적 링크 — noindex 글이지만 follow 라 링크 권한은 흐름 (H2H 발견 경로) */}
      {article.match && (
        <p className="mt-3 text-sm">
          <Link
            href={`/h2h/${Math.min(article.match.homeTeamId, article.match.awayTeamId)}-vs-${Math.max(article.match.homeTeamId, article.match.awayTeamId)}`}
            className="inline-flex items-center gap-1.5 font-medium text-blue-600 break-keep hover:underline dark:text-blue-400"
            prefetch={false}
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {toKoreanTeamName(article.match.homeTeam.name, article.league) || article.match.homeTeam.name} vs{" "}
            {toKoreanTeamName(article.match.awayTeam.name, article.league) || article.match.awayTeam.name} 역대
            상대전적 보기 →
          </Link>
        </p>
      )}

      {/* 야구(KBO/MLB/NPB) — Poisson 이닝별 득점 확률 차트.
          generate-articles / generate-previews 가 baseballContext JSON 저장. */}
      {article.baseballContext && article.match && (() => {
        try {
          const bc = JSON.parse(article.baseballContext) as {
            inningScoreProbs?: InningProb[];
            totalExpectedRuns?: { team1: number; team2: number };
            winProbPoisson?: { team1: number; team2: number };
          };
          if (!bc.inningScoreProbs || !bc.totalExpectedRuns) return null;
          return (
            <InningScoreChart
              inningProbs={bc.inningScoreProbs}
              awayName={toKoreanTeamName(article.match!.awayTeam.name, article.league)}
              homeName={toKoreanTeamName(article.match!.homeTeam.name, article.league)}
              totalExpectedRuns={bc.totalExpectedRuns}
              winProb={bc.winProbPoisson}
            />
          );
        } catch {
          return null;
        }
      })()}

      {article.match && (
        <InjuryAndKeyPlayers
          league={article.league}
          homeTeamName={article.match.homeTeam.name}
          awayTeamName={article.match.awayTeam.name}
          matchStartTime={article.match.startTime}
        />
      )}

      {/* 축구 경기 — 더 풍부한 라인업·실시간 통계는 라이브스코어 상세로 유도 */}
      {article.match && SOCCER_LEAGUES.has(article.league) && article.match.externalId && (
        <Link
          href={`/live/${article.league}/${article.match.externalId}`}
          prefetch={false}
          className="group mt-6 flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-blue-400 dark:border-blue-900/40 dark:bg-blue-950/30"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-bold text-blue-700 dark:text-blue-300">
              <Activity className="h-4 w-4 shrink-0" aria-hidden />
              <span className="break-keep">이 경기 실시간 상세 보기</span>
            </div>
            <p className="mt-0.5 text-[13px] text-neutral-600 break-keep dark:text-neutral-400">
              라인업·팀 통계·경기 추이·맞대결을 라이브스코어에서 자세히
            </p>
          </div>
          <span className="shrink-0 text-lg text-blue-500 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
            →
          </span>
        </Link>
      )}

      <AiConsensusWidget />
      <RelatedArticles league={article.league} currentId={article.id} />

      <div className="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-sm">
        <Link
          href="/"
          className="text-neutral-500 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white"
        >
          ← 메인으로
        </Link>
        <Link
          href={`/leagues/${article.league}`}
          className="text-neutral-500 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-neutral-900 dark:hover:text-white"
        >
          {article.league} 더 보기 →
        </Link>
      </div>
    </article>
  );
}

/** 팀 로고 — logoUrl 없으면 이니셜 마크로 폴백 */
function TeamLogo({ src, name }: { src?: string | null; name: string }) {
  if (src) {
    // Liquipedia (LCK 로고) 는 hotlink 차단으로 plain <img> 안 됨 →
    // Next.js image optimizer 통과. 다른 CDN 은 hotlink 허용이라 그대로.
    if (src.includes("liquipedia.net")) {
      return (
        <Image
          src={src}
          alt={`${name} 로고`}
          width={64}
          height={64}
          className="w-14 h-14 sm:w-16 sm:h-16 object-contain bg-white rounded-md p-1.5 shadow-sm"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={`${name} 로고`}
        width={56}
        height={56}
        loading="lazy"
        className="w-14 h-14 sm:w-16 sm:h-16 object-contain bg-white rounded-md p-1.5 shadow-sm"
      />
    );
  }
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div
      className="w-14 h-14 sm:w-16 sm:h-16 rounded-md bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 flex items-center justify-center text-2xl font-black text-neutral-500"
      aria-label={`${name} 로고 없음`}
    >
      {initial}
    </div>
  );
}

/* =====================================================================
 * 데이터 출처 + 저작권 footer
 * Google E-E-A-T / 투명성 가이드 부합 — 출처 인용·저작권 명시.
 * ===================================================================*/
const DATA_SOURCES_BY_LEAGUE: Record<string, string[]> = {
  // 축구 - football-data.org + api-football Pro + The Odds API
  EPL:        ["football-data.org", "api-football Pro", "The Odds API"],
  LALIGA:     ["api-football Pro", "ESPN", "The Odds API"],
  BUNDESLIGA: ["api-football Pro", "ESPN", "The Odds API"],
  SERIE_A:    ["api-football Pro", "ESPN", "The Odds API"],
  LIGUE_1:    ["api-football Pro", "ESPN", "The Odds API"],
  MLS:        ["api-football Pro", "ESPN", "The Odds API"],
  UCL:        ["api-football Pro", "ESPN", "The Odds API"],
  WORLD_CUP:  ["api-football Pro", "eloratings.net (시드 Elo)"],
  // 야구
  MLB:        ["api-sports baseball Pro", "MLB Stats API (선발 투수)", "The Odds API"],
  KBO:        ["api-sports baseball Pro"],
  NPB:        ["api-sports baseball Pro"],
  // 농구·하키
  NBA:        ["ESPN", "The Odds API"],
  NHL:        ["NHL 공식 API (api-web.nhle.com)", "ESPN", "The Odds API"],
};

function AiDisclosure({
  league,
  url,
}: {
  league: string;
  url: string;
}) {
  const sources = DATA_SOURCES_BY_LEAGUE[league] ?? ["공식 스포츠 데이터"];
  return (
    <aside className="mt-8 rounded-[1.25rem] bg-zinc-100 px-5 py-4 text-xs leading-relaxed text-zinc-600 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-white/55 dark:ring-white/10">
      <div className="space-y-1">
        <p>
          <strong className="text-zinc-900 dark:text-white">데이터 출처</strong>
          {" — "}
          {sources.join(" · ")}. 모든 통계는 매치 시점 기준으로
          계산되며 결과는 모델 추정치로 베팅 결과를 보장하지 않습니다.
        </p>
        <p>
          <strong className="text-zinc-900 dark:text-white">저작권</strong>
          {" — "}© {SITE_NAME}. 이 글의 원문은{" "}
          <a
            href={url}
            className="underline underline-offset-2 hover:text-zinc-900 dark:hover:text-white"
          >
            {url.replace(/^https?:\/\//, "")}
          </a>
          {" "}입니다. 무단 전재·재배포를 금합니다.
        </p>
      </div>
    </aside>
  );
}

/* =====================================================================
 * 외부 참고 출처 — 권위 있는 공식 사이트·통계 사이트 링크
 * rel="nofollow noopener" 로 PageRank 손실 방지 + 보안.
 * ===================================================================*/
function ExternalSources({ league }: { league: string }) {
  const links = getExternalLinks(league);
  if (links.length === 0) return null;

  return (
    <aside className="mt-3 rounded-[1.25rem] bg-white px-5 py-4 text-xs shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="mb-1.5 font-medium text-zinc-500 dark:text-white/45">
        참고 출처
      </div>
      <ul className="space-y-1">
        {links.map((l) => (
          <li key={l.url} className="flex items-center gap-2 leading-relaxed">
            <span className="text-zinc-400 dark:text-white/35">·</span>
            <span className="text-zinc-600 dark:text-white/70">{l.label}</span>
            <span className="text-zinc-300 dark:text-white/20">—</span>
                <a
                  href={l.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                >
                  {l.display}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden
                    className="opacity-60"
                  >
                    <path
                      d="M3 9L9 3M9 3H4.5M9 3V7.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
