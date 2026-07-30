// 야구 리그별 경기 분석 랜딩 — /previews/NPB · /previews/KBO · /previews/MLB.
//
// 왜 별도 경로인가. 기존 /previews?sport=BASEBALL&league=NPB 는 canonical 이
// /previews?sport=BASEBALL(3리그 혼합)로 정규화돼 "NPB 경기 분석" 을 찾는 검색에
// 매칭될 URL 이 없었다 (2026-07 빙 실측: 해당 검색어 296노출이 홈·리그허브로 흩어져 클릭 0).
// 리그 단위 경로 + 리그 전용 H1·리드·내부링크로 의도를 정확히 받는다.
//
// 개별 PREVIEW 글은 noindex 유지(2026-05 scaled content 디톡스) — 여기서 링크로만 잇는다.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import ArticleCard from "@/components/ArticleCard";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import { jsonLdScript } from "@/lib/seo/jsonld";

export const revalidate = 600;

// 야구 3리그만. 축구는 리그 수가 많아 별도 판단이 필요하고, 이 경로는 야구 검색 의도
// (선발 매치업·경기 분석)에 맞춘 카피라 그대로 확장하면 안 된다.
const LEAGUES: Record<
  string,
  { name: string; full: string; lead: string; description: string }
> = {
  NPB: {
    name: "NPB",
    full: "일본프로야구",
    lead: "NPB(일본프로야구) 경기를 데이터로 미리 봅니다. 예고 선발 매치업과 ERA 비교, 팀 최근 폼, 상대 전적을 경기 시작 전에 정리합니다.",
    description:
      "NPB 일본프로야구 경기 분석. 예고 선발 투수 매치업과 ERA 비교, 최근 폼, 상대 전적을 경기 전에 정리합니다. 센트럴·퍼시픽 리그 전 경기 자동 업데이트.",
  },
  KBO: {
    name: "KBO",
    full: "한국프로야구",
    lead: "KBO 리그 경기를 데이터로 미리 봅니다. 당일 확정 선발 매치업과 ERA 비교, 팀 최근 폼, 상대 전적을 경기 시작 전에 정리합니다.",
    description:
      "KBO 한국프로야구 경기 분석. 확정 선발 투수 매치업과 ERA 비교, 최근 폼, 상대 전적을 경기 전에 정리합니다. 10개 구단 전 경기 자동 업데이트.",
  },
  MLB: {
    name: "MLB",
    full: "메이저리그",
    lead: "MLB(메이저리그) 경기를 데이터로 미리 봅니다. 선발 투수 매치업과 ERA·WHIP 비교, 팀 최근 폼, 상대 전적을 경기 시작 전에 정리합니다.",
    description:
      "MLB 메이저리그 경기 분석. 선발 투수 매치업과 ERA·WHIP 비교, 최근 폼, 상대 전적을 경기 전에 정리합니다. 최대 3일 전 발행, 선발 변경 시 배지 표시.",
  },
};

const UPCOMING_LIMIT = 18;
const PAST_LIMIT = 12;

const ARTICLE_INCLUDE = {
  match: {
    select: {
      startersUpdatedAt: true,
      homeStarter: true,
      awayStarter: true,
      startTime: true,
      status: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  },
} satisfies Prisma.ArticleInclude;

interface Props {
  params: Promise<{ league: string }>;
}

export function generateStaticParams() {
  return Object.keys(LEAGUES).map((league) => ({ league }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { league } = await params;
  const info = LEAGUES[league.toUpperCase()];
  if (!info) return {};
  return {
    title: `${info.name} 경기 분석 — 선발 매치업·전력 비교 (${info.full})`,
    description: info.description,
    alternates: { canonical: `/previews/${info.name}` },
  };
}

export default async function LeaguePreviewsPage({ params }: Props) {
  const { league: raw } = await params;
  const league = raw.toUpperCase();
  const info = LEAGUES[league];
  if (!info) notFound();

  const base: Prisma.ArticleWhereInput = {
    status: "PUBLISHED",
    type: "PREVIEW",
    league,
    // 경기 삭제로 끊긴 orphan 글 제외 — startTime null 이 정렬 맨 앞을 차지한다.
    matchId: { not: null },
  };
  const now = new Date();
  // 예정 경기는 글보다 먼저 존재한다 (KBO·NPB 는 선발 확정 후에야 프리뷰가 나온다).
  // 글이 아직 없는 경기도 일정으로 보여줘야 "오늘 뭐 하지"에 답하는 페이지가 된다.
  const scheduleFrom = new Date(now.getTime() - 6 * 3600_000);
  const [upcoming, past, total, fixtures] = await Promise.all([
    prisma.article.findMany({
      where: { ...base, match: { startTime: { gte: now } } },
      orderBy: [{ match: { startTime: "asc" } }, { publishedAt: "desc" }],
      take: UPCOMING_LIMIT,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.findMany({
      where: { ...base, match: { startTime: { lt: now } } },
      orderBy: [{ match: { startTime: "desc" } }, { publishedAt: "desc" }],
      take: PAST_LIMIT,
      include: ARTICLE_INCLUDE,
    }),
    prisma.article.count({ where: base }),
    prisma.match.findMany({
      where: {
        league,
        status: "SCHEDULED",
        startTime: { gte: scheduleFrom, lt: new Date(now.getTime() + 3 * 86400_000) },
      },
      orderBy: { startTime: "asc" },
      take: 18,
      select: {
        id: true,
        startTime: true,
        homeStarter: true,
        awayStarter: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  // 글이 이미 있는 경기는 카드로 나가므로 일정 줄에서 뺀다 (같은 경기 두 번 노출 방지).
  const articleMatchIds = new Set(
    [...upcoming, ...past].map((a) => a.matchId).filter((v): v is number => v != null),
  );
  const pendingFixtures = fixtures.filter((m) => !articleMatchIds.has(m.id));

  const canonicalUrl = `${SITE_URL}/previews/${info.name}`;
  const title = `${info.name} 경기 분석`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        {
          "@type": "ListItem",
          position: 2,
          name: "프리뷰",
          item: `${SITE_URL}/previews`,
        },
        { "@type": "ListItem", position: 3, name: title },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${title} — ${info.full}`,
      url: canonicalUrl,
      description: info.description,
      inLanguage: "ko",
      publisher: {
        "@type": "Organization",
        name: "스코어베이스",
        url: SITE_URL,
        logo: `${SITE_URL}/icon.png`,
      },
    },
  ];

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <AmbientGlow />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      <nav className="flex items-center gap-2 text-xs text-neutral-500">
        <Link href="/" className="hover:underline">
          홈
        </Link>
        <span>›</span>
        <Link href="/previews" className="hover:underline">
          프리뷰
        </Link>
        <span>›</span>
        <span className="text-neutral-700 dark:text-neutral-300">{title}</span>
      </nav>

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />{" "}
          경기 분석
        </span>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          {title}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep max-w-2xl">
          {info.lead}
        </p>
        <p className="text-xs text-neutral-500">
          {info.full} · 누적 분석 {total.toLocaleString()}건 · 경기 시작 전 자동 발행
        </p>
      </header>

      {/* 리그 데이터 동선 — 분석을 본 뒤 순위·예측으로 넘어가는 입구 */}
      <div className="flex flex-wrap gap-2">
        {[
          { href: `/standings/${info.name}`, label: `${info.name} 순위` },
          { href: `/predictions/${info.name}`, label: `${info.name} 시즌 예측` },
          { href: `/leagues/${info.name}`, label: `${info.name} 리그 정보` },
          { href: "/baseball", label: "야구 허브" },
        ].map((l) => (
          <Link
            key={l.href}
            href={l.href}
            prefetch={false}
            className="rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 ring-black/10 transition hover:-translate-y-0.5 hover:bg-neutral-50 dark:ring-white/15 dark:hover:bg-white/[0.06]"
          >
            {l.label}
          </Link>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">예정 경기 분석</h2>
        {upcoming.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        )}

        {pendingFixtures.length > 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-black/5 divide-y divide-neutral-200 dark:bg-white/[0.04] dark:ring-white/10 dark:divide-neutral-800">
            {pendingFixtures.map((m) => (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <time
                  dateTime={m.startTime.toISOString()}
                  className="w-24 shrink-0 text-xs tabular-nums text-neutral-500"
                >
                  {m.startTime.toLocaleString("ko-KR", {
                    timeZone: "Asia/Seoul",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </time>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <TeamBadge logoUrl={m.homeTeam?.logoUrl} size={18} />
                  <span className="truncate">
                    {toKoreanTeamName(m.homeTeam?.name ?? "", league)}
                  </span>
                  <span className="text-neutral-400">vs</span>
                  <TeamBadge logoUrl={m.awayTeam?.logoUrl} size={18} />
                  <span className="truncate">
                    {toKoreanTeamName(m.awayTeam?.name ?? "", league)}
                  </span>
                </div>
                <span className="shrink-0 text-[11px] text-neutral-400">
                  {m.homeStarter && m.awayStarter ? "분석 준비 중" : "선발 발표 대기"}
                </span>
              </div>
            ))}
          </div>
        )}

        {upcoming.length === 0 && pendingFixtures.length === 0 && (
          <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-6 text-center text-sm text-neutral-500 break-keep">
            현재 예정 경기가 없습니다. 휴식일·올스타 브레이크 기간에는 비어 있을 수
            있습니다.
          </p>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">지난 경기 분석</h2>
          <p className="text-xs text-neutral-500 break-keep">
            경기 전 전망과 실제 결과를 함께 볼 수 있습니다. 카드에 최종 스코어가
            표시됩니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {past.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}

      <div className="pt-2 text-sm">
        <Link
          href={`/previews?sport=BASEBALL&league=${info.name}`}
          prefetch={false}
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          {info.name} 분석 전체 보기 →
        </Link>
      </div>
    </div>
  );
}
