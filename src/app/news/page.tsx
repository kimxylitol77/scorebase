// 해외 뉴스 게시판 — 공신력 소스(BBC·Sky·The Athletic·ESPN·리그 공식)의 해외 보도를
// 사실 기반 한국어 브리핑으로 재구성해 모아 보는 목록. 발행 파이프라인은
// src/jobs/fetch-news-briefing.ts, 개별 글은 색인 보존을 위해 /analysis/{id} 를 그대로 쓴다.
//
// 레이아웃은 카드가 아니라 목록형이다 — 원문 사진은 저작권 때문에 쓸 수 없어 썸네일이
// 없는데, 이미지 없는 카드 그리드는 빈 공간만 커지고 훑어보기도 불편하다.
// 반응형은 display 토글(hidden sm:flex) 대신 flex-wrap 으로 접는다 (윈도우 grid 무력화 이슈 회피).
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import BoardTabs from "@/components/BoardTabs";
import Pagination from "@/components/Pagination";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { SITE_URL } from "@/lib/site-url";
import { lookupNbaPlayer, nbaPlayerHref } from "@/lib/sports/nba-players";
import type { TxLeague } from "@/lib/sports/espn-transactions";

export const revalidate = 300; // 5분 — 발행 주기가 2시간이라 충분

const PAGE_SIZE = 30;

const SPORT_TABS = [
  { code: null, label: "전체" },
  { code: "soccer", label: "축구" },
  { code: "baseball", label: "야구" },
  { code: "basketball", label: "농구" },
  { code: "hockey", label: "하키" },
] as const;

const SPORT_LABEL: Record<string, string> = {
  soccer: "축구",
  baseball: "야구",
  basketball: "농구",
  hockey: "하키",
};

const SPORT_STYLE: Record<string, string> = {
  soccer: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  baseball: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400",
  basketball: "bg-orange-500/10 text-orange-600 ring-orange-500/20 dark:text-orange-400",
  hockey: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400",
};

// 종목 → ESPN 트랜잭션 리그. 브리핑 재료(원문 본문)가 없는 종목을 트랜잭션이 채운다.
// 축구는 넣지 않는다 — BBC·The Guardian 이 본문을 줘서 브리핑만으로 충분하다.
const TX_LEAGUE: Record<string, TxLeague> = {
  basketball: "NBA",
  baseball: "MLB",
  hockey: "NHL",
};
const TX_SPORT: Record<string, string> = { NBA: "basketball", MLB: "baseball", NHL: "hockey" };

// 트랜잭션 유형 → 목록 말머리. /transactions/nba 와 같은 라벨을 쓴다.
const TX_TAG: Record<string, string> = {
  trade: "트레이드",
  signing: "계약",
  short_term: "단기계약",
  waive: "방출",
  staff: "감독·프런트",
  other: "이적",
};

export const metadata: Metadata = {
  title: "해외 스포츠 뉴스 — 공신력 소스 한국어 브리핑",
  description:
    "BBC·The Guardian 등 공신력 있는 해외 보도를 한국어 브리핑으로 정리하고 NBA·MLB·NHL 트랜잭션을 함께 모았습니다. 해외축구 이적·계약·부상·감독 소식을 하루 여러 차례 업데이트합니다.",
  keywords: [
    "해외축구 뉴스",
    "해외축구 이적",
    "해외축구 소식 한국어",
    "BBC 축구 뉴스",
    "가디언 축구",
    "프리미어리그 뉴스",
    "NBA 트레이드 소식",
    "MLB 트레이드 소식",
  ],
  alternates: { canonical: `${SITE_URL}/news` },
  openGraph: {
    title: "해외 스포츠 뉴스 — 공신력 소스 한국어 브리핑",
    description: "BBC·The Guardian 해외축구 브리핑과 NBA·MLB·NHL 트랜잭션을 한국어로",
    url: `${SITE_URL}/news`,
    type: "website",
  },
};

type Props = { searchParams: Promise<{ page?: string; sport?: string }> };

/** 본문 마크다운에서 목록용 한 줄 발췌 — 출처 푸터(--- 이후)와 마크다운 기호를 걷어낸다. */
function excerpt(content: string, len = 95): string {
  const flat = content
    .split("\n---\n")[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|\*|`|#+\s?/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > len ? `${flat.slice(0, len)}…` : flat;
}

/** 제목 말머리 "[BBC] …" 분리 — 배지와 제목을 따로 렌더한다. */
function splitTag(title: string): { tag: string | null; rest: string } {
  const m = title.match(/^\[([^\]]{1,12})\]\s*(.+)$/);
  return m ? { tag: m[1], rest: m[2] } : { tag: null, rest: title };
}

function timeAgo(d: Date): string {
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  if (h < 1) return "방금";
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}일 전`;
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}. ${k.getUTCDate()}.`;
}

/** 목록 한 줄 — 연결할 페이지가 있으면 링크, 없으면 평범한 행. 야구 트랜잭션이 후자다. */
function Row({ href, children }: { href: string | null; children: React.ReactNode }) {
  const cls =
    "group flex flex-col gap-1.5 px-4 sm:px-6 py-3.5 transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.03]";
  return href ? (
    <Link href={href} className={cls}>
      {children}
    </Link>
  ) : (
    <div className={cls}>{children}</div>
  );
}

export default async function NewsPage({ searchParams }: Props) {
  const { page, sport } = await searchParams;
  const cur = Math.max(1, Number(page) || 1);
  const sportFilter = sport && SPORT_LABEL[sport] ? sport : null;

  const where = { category: "BRIEFING", ...(sportFilter ? { sport: sportFilter } : {}) };

  // 트랜잭션도 이 목록의 소식이다 — 농구·야구는 브리핑 재료를 주는 소스가 없어(제목만 오는
  // 피드뿐) 빼면 탭이 사실상 빈 화면이다. 축구·하키 탭에서는 섞이지 않는다.
  const txLeagues: TxLeague[] = sportFilter
    ? TX_LEAGUE[sportFilter]
      ? [TX_LEAGUE[sportFilter]]
      : []
    : ["NBA", "MLB", "NHL"];
  const withTx = txLeagues.length > 0;
  // 두 소스를 날짜순으로 합치므로 각각 현재 페이지까지를 넉넉히 받아 와 잘라 쓴다.
  const need = cur * PAGE_SIZE;

  const [postRows, counts, txRows, txCounts] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: need,
      select: { id: true, title: true, content: true, sport: true, views: true, commentCount: true, createdAt: true },
    }),
    prisma.post.groupBy({ by: ["sport"], _count: true, where: { category: "BRIEFING" } }),
    withTx
      ? prisma.sportsTransaction.findMany({
          where: { league: { in: txLeagues } },
          orderBy: [{ date: "desc" }, { id: "asc" }],
          take: need,
          select: { id: true, date: true, league: true, category: true, playerName: true, descriptionKo: true, description: true },
        })
      : Promise.resolve([]),
    // 탭 배지는 필터와 무관하게 리그별 전체 건수가 필요하다.
    prisma.sportsTransaction.groupBy({ by: ["league"], _count: true }),
  ]);

  const bySport = new Map(counts.map((g) => [g.sport, g._count]));
  // 우리가 목록에 싣는 리그만 총계에 넣는다 — 수집만 되고 안 싣는 리그가 생겨도 어긋나지 않게.
  const txByLeague = new Map(txCounts.map((g) => [g.league, g._count]));
  const txShown = Object.values(TX_LEAGUE).reduce((sum, lg) => sum + (txByLeague.get(lg) ?? 0), 0);
  const totalAll = counts.reduce((s, g) => s + g._count, 0) + txShown;
  // 종목 건수 — 농구·야구는 브리핑 + 트랜잭션. 탭 배지와 페이지 수가 같은 식을 써야 어긋나지 않는다.
  const sportCount = (code: string) =>
    (bySport.get(code) ?? 0) + (TX_LEAGUE[code] ? (txByLeague.get(TX_LEAGUE[code]) ?? 0) : 0);
  const total = sportFilter ? sportCount(sportFilter) : totalAll;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 원문 출처 — Post 본문엔 링크만 있고 매체명이 구조화돼 있지 않아 NewsBriefing 에서 가져온다.
  const sources = postRows.length
    ? await prisma.newsBriefing.findMany({
        where: { postId: { in: postRows.map((p) => p.id) } },
        select: { postId: true, sourceName: true },
      })
    : [];
  const srcByPost = new Map(sources.map((s) => [s.postId, s.sourceName]));

  // 브리핑 글과 트랜잭션을 같은 모양으로 맞춰 날짜순 한 목록으로.
  interface FeedItem {
    key: string;
    date: Date;
    sport: string;
    tag: string | null;
    title: string;
    sub: string; // 목록 둘째 줄 (발췌 또는 원문)
    href: string | null; // 연결할 페이지가 없으면 null (링크 없이 렌더)
    source: string | null;
    views: number | null;
    comments: number;
  }

  const postItems: FeedItem[] = postRows.map((p) => {
    const { tag, rest } = splitTag(p.title);
    return {
      key: `post-${p.id}`,
      date: p.createdAt,
      sport: p.sport ?? "soccer",
      tag,
      title: rest,
      sub: excerpt(p.content),
      href: `/analysis/${p.id}`,
      source: srcByPost.get(p.id) ?? null,
      views: p.views,
      comments: p.commentCount,
    };
  });

  const txItems: FeedItem[] = txRows.map((t) => ({
    key: `tx-${t.id}`,
    date: t.date,
    sport: TX_SPORT[t.league] ?? "basketball",
    tag: TX_TAG[t.category] ?? TX_TAG.other,
    title: t.descriptionKo || t.description,
    // 한글 번역이 있으면 영문 원문을 둘째 줄에 — /transactions/nba 와 같은 방식.
    sub: t.descriptionKo ? t.description : "",
    // NBA 는 선수 사전이 있어 선수 페이지(이동 이력 탭까지 이어진다)로, 매칭 실패하거나
    // 다른 리그면 해당 리그 트랜잭션 피드로 — 세 리그 다 갈 곳이 있다.
    href:
      (t.league === "NBA" ? nbaPlayerHref(lookupNbaPlayer(t.playerName)) : null) ??
      `/transactions/${t.league.toLowerCase()}`,
    source: "ESPN 트랜잭션",
    views: null,
    comments: 0,
  }));

  const items = [...postItems, ...txItems]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);

  const href = (p: number, s: string | null = sportFilter) => {
    const q = new URLSearchParams();
    if (s) q.set("sport", s);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/news?${qs}` : "/news";
  };

  const ld = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "해외 스포츠 뉴스 — 공신력 소스 한국어 브리핑",
    description:
      "BBC·Sky Sports·The Athletic·ESPN·리그 공식 발표 등 공신력 있는 해외 보도를 한국어 브리핑으로 정리한 목록.",
    url: `${SITE_URL}/news`,
    mainEntity: {
      "@type": "ItemList",
      // 트랜잭션은 개별 상세 URL 이 없어 넣지 않는다 — 같은 주소가 반복되면 ItemList 가 망가진다.
      itemListElement: postItems.slice(0, 20).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${SITE_URL}${p.href}`,
        name: p.title,
      })),
    },
  };

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      <AmbientGlow />

      <header className="mb-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden /> 해외 뉴스
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          해외 스포츠 뉴스
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-3 break-keep leading-relaxed">
          BBC · The Guardian 등 공신력 있는 해외 보도를 한국어 브리핑으로 정리하고,
          NBA · MLB · NHL 트랜잭션(계약 · 트레이드 · 방출)을 함께 모았습니다. 해외축구의 이적 · 계약 ·
          부상 · 감독 소식을 하루 여러 차례 업데이트합니다.
        </p>
        <div className="mt-6">
          <BoardTabs active="briefing" />
        </div>
      </header>

      {/* 종목 필터 */}
      <div className="mb-5 flex flex-wrap gap-2">
        {SPORT_TABS.filter(
          // 한 건도 없는 탭은 눌러 볼 이유가 없다. 현재 보고 있는 탭은 남긴다.
          (t) => t.code === null || sportFilter === t.code || sportCount(t.code) > 0,
        ).map((t) => {
          const on = sportFilter === t.code;
          const n = t.code === null ? totalAll : sportCount(t.code);
          return (
            <Link
              key={t.label}
              href={href(1, t.code)}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-colors ${
                on
                  ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
                  : "bg-white text-neutral-600 ring-neutral-200 hover:text-neutral-900 dark:bg-white/[0.04] dark:text-neutral-400 dark:ring-white/10 dark:hover:text-neutral-100"
              }`}
            >
              {t.label}
              <span className={`ml-1.5 text-[11px] ${on ? "opacity-70" : "text-neutral-400"}`}>{n}</span>
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-neutral-500 py-16 text-center">
          아직 브리핑이 없습니다. 곧 첫 소식이 올라옵니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-[1.5rem] bg-white ring-1 ring-black/5 shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {items.map((it) => (
              <li key={it.key}>
                <Row href={it.href}>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${
                        SPORT_STYLE[it.sport] ?? SPORT_STYLE.soccer
                      }`}
                    >
                      {SPORT_LABEL[it.sport] ?? "축구"}
                    </span>
                    {it.tag && (
                      <span className="shrink-0 rounded-md bg-neutral-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:text-neutral-400">
                        {it.tag}
                      </span>
                    )}
                    <span className="font-semibold text-[15px] sm:text-base leading-snug break-keep transition-colors group-hover:text-sky-600 dark:group-hover:text-sky-400">
                      {it.title}
                    </span>
                    {it.comments > 0 && (
                      <span className="shrink-0 text-xs font-semibold text-rose-500">[{it.comments}]</span>
                    )}
                  </span>

                  {it.sub && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400 line-clamp-1 leading-relaxed">
                      {it.sub}
                    </span>
                  )}

                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-400">
                    {it.source && <span className="font-medium text-neutral-500 dark:text-neutral-400">{it.source}</span>}
                    {it.source && <span aria-hidden>·</span>}
                    <span>{timeAgo(it.date)}</span>
                    {it.views != null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>조회 {it.views}</span>
                      </>
                    )}
                  </span>
                </Row>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Pagination cur={cur} totalPages={totalPages} href={href} />

      <p className="mt-8 text-[11px] leading-relaxed text-neutral-400 dark:text-neutral-500 break-keep">
        공신력 있는 해외 보도의 사실을 확인해 한국어로 재구성한 브리핑입니다. 전문 번역이 아니며,
        각 글에 원문 출처를 링크로 밝힙니다. 자세한 내용은 원문에서 확인하세요.{" "}
        &lsquo;계약 · 트레이드 · 방출&rsquo; 말머리가 붙은 항목은 ESPN 트랜잭션 피드를 옮긴 것으로,
        전체 목록은{" "}
        <Link href="/transactions/nba" className="text-sky-600 hover:underline dark:text-sky-400">
          NBA 트랜잭션
        </Link>{" "}
        에서 볼 수 있습니다.
      </p>
    </main>
  );
}
