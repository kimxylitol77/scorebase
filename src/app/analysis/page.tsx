// 스포츠 분석 게시판 — 회원·봇 승부예측 글 목록 + 적중 자동채점·종목 필터.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { displayGrade } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listDate, hitRate } from "@/lib/analysis/format";
import { pickOdds, fmtOdds } from "@/lib/analysis/odds";
import { SITE_URL } from "@/lib/site-url";
import { Trophy, SquarePen, Target, Flame, X } from "lucide-react";
import { resolveAvatar } from "@/lib/analysis/analysts";

export const dynamic = "force-dynamic"; // 조회/추천 실시간 반영

export const metadata: Metadata = {
  title: "스포츠 분석 게시판 — 축구·야구·농구 승부예측 + 적중 자동채점",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 모든 예측은 실제 경기 결과로 자동 채점되어 적중률·연승으로 랭킹이 매겨집니다. EPL·라리가·MLB·NBA·NHL.",
  keywords: [
    "스포츠 분석", "승부예측", "축구 분석", "경기 분석 게시판", "스포츠 픽",
    "예측 적중률", "스포츠 커뮤니티", "축구 예측", "야구 분석", "스포츠 토론",
  ],
  alternates: { canonical: `${SITE_URL}/analysis` },
  openGraph: {
    title: "스포츠 분석 게시판",
    description: "회원 경기 분석·승부 예측 + 적중 자동채점·랭킹.",
    url: `${SITE_URL}/analysis`,
  },
};

// 구조화 데이터 (CollectionPage) — 분석 커뮤니티를 콘텐츠 페이지로 인식.
const ANALYSIS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "스포츠 분석 게시판",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 예측 적중은 실제 경기 결과로 자동 채점됩니다.",
  url: `${SITE_URL}/analysis`,
  isPartOf: { "@type": "WebSite", name: "스코어베이스", url: SITE_URL },
  about: "스포츠 경기 분석 및 승부 예측 커뮤니티",
  inLanguage: "ko-KR",
};

// 데스크탑 그리드 컬럼 — 제목(1fr)·작성자를 넓게, 부수 칸(분류·배당·등록일·조회·추천)은 좁게.
const COLS = "sm:grid-cols-[60px_minmax(0,1fr)_240px_50px_52px_42px_42px]";

const PAGE_SIZE = 20;

// 종목 필터 탭 — Post.sport 값과 1:1 (sport-leagues SportCode 부분집합).
const SPORT_TABS = [
  { code: "soccer", label: "축구" },
  { code: "baseball", label: "야구" },
  { code: "basketball", label: "농구" },
  { code: "hockey", label: "하키" },
  { code: "esports", label: "롤" },
  { code: "volleyball", label: "배구" },
  { code: "mma", label: "UFC" },
] as const;
const SPORT_META: Record<string, { label: string }> = Object.fromEntries(
  SPORT_TABS.map((s) => [s.code, { label: s.label }]),
);

// 자유게시판 말머리 탭 — sport 재사용 (talk = sport null 잡담)
const FREE_TABS = [
  { code: "soccer", label: "축구" },
  { code: "baseball", label: "야구" },
  { code: "talk", label: "잡담" },
] as const;

interface Props {
  searchParams: Promise<{ page?: string; sport?: string; board?: string }>;
}

// 페이지 번호 목록 (총 7개 초과 시 … 으로 축약: 1 … 4 5 6 … 10)
function pageList(cur: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, cur - 1);
  const end = Math.min(total - 1, cur + 1);
  if (start > 2) out.push("…");
  for (let p = start; p <= end; p++) out.push(p);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

// 작성자 아바타 — /experts 와 동일(resolveAvatar): 회원이 설정한 아바타 우선,
// 미설정(봇 등)은 닉네임 해시로 결정적 프리셋 → 모든 작성자가 색 원형 아바타.
function AuthorBadge({
  avatarUrl,
  nickname,
  level,
  badge,
  size = "h-8 w-8 text-base",
}: {
  avatarUrl: string | null;
  nickname: string;
  level?: number;
  badge?: string | null;
  size?: string;
}) {
  const av = resolveAvatar(avatarUrl, nickname, level, badge);
  if (av.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={av.imageUrl}
        alt=""
        className={`inline-block shrink-0 rounded-full object-cover ${size}`}
        aria-hidden
        loading="lazy"
      />
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${av.bg} ${size}`}
      aria-hidden
    >
      {av.emoji}
    </span>
  );
}

export default async function AnalysisListPage({ searchParams }: Props) {
  const { page, sport, board } = await searchParams;
  // 한 페이지 세 보드 — 스포츠 분석(기본) | 자유게시판(?board=free) | 해외 브리핑(?board=briefing).
  // 같은 테이블 UI 공유. 브리핑은 봇 전용 발행 보드 (글쓰기·종목 탭 없음).
  const isFreeBoard = board === "free";
  const isBriefing = board === "briefing";
  const cur = Math.max(1, Number(page) || 1);
  const sportFilter = isBriefing
    ? null
    : isFreeBoard
      ? FREE_TABS.some((t) => t.code === sport) ? sport! : null
      : SPORT_META[sport ?? ""] ? sport! : null;
  const href = (p: number, s: string | null = sportFilter) => {
    const q = new URLSearchParams();
    if (isFreeBoard) q.set("board", "free");
    if (isBriefing) q.set("board", "briefing");
    if (s) q.set("sport", s);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/analysis?${qs}` : "/analysis";
  };
  const catWhere = { category: isBriefing ? "BRIEFING" : isFreeBoard ? "FREE" : "ANALYSIS" };
  const sportWhere = sportFilter ? (sportFilter === "talk" ? { sport: null } : { sport: sportFilter }) : {};
  const [posts, sportCounts, userId] = await Promise.all([
    prisma.post.findMany({
      where: { ...catWhere, ...sportWhere },
      orderBy: { createdAt: "desc" },
      skip: (cur - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        views: true,
        likes: true,
        commentCount: true,
        createdAt: true,
        isCorrect: true,
        market: true,
        pick: true,
        sport: true,
        category: true,
        dreamTeamId: true,
        lineupCode: true,
        match: {
          select: {
            oddsHome: true,
            oddsDraw: true,
            oddsAway: true,
            oddsHcHome: true,
            oddsHcAway: true,
            oddsOver: true,
            oddsUnder: true,
          },
        },
        author: {
          select: {
            nickname: true,
            avatarUrl: true,
            level: true,
            badge: true,
            predTotal: true,
            predHit: true,
            predStreak: true,
          },
        },
      },
    }),
    // 종목별 글 수 — 탭 카운트 + 필터된 총 페이지 계산 (한 쿼리)
    prisma.post.groupBy({ by: ["sport"], _count: true, where: catWhere }),
    getCurrentUserId(),
  ]);
  const countBySport = new Map(sportCounts.map((g) => [g.sport, g._count]));
  const talkCount = countBySport.get(null) ?? 0; // 자유게시판 잡담 = sport null
  const totalAll = sportCounts.reduce((s, g) => s + g._count, 0);
  const total = sportFilter ? (sportFilter === "talk" ? talkCount : (countBySport.get(sportFilter) ?? 0)) : totalAll;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ANALYSIS_JSONLD) }}
      />
      {/* 앰비언트 배경 — 상단에 은은한 메시 글로우 */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[440px] overflow-hidden">
        <div className="absolute -top-40 left-[15%] h-96 w-96 rounded-full bg-rose-500/10 blur-[130px] dark:bg-rose-500/15" />
        <div className="absolute -top-32 right-[12%] h-[26rem] w-[26rem] rounded-full bg-emerald-500/[0.06] blur-[140px] dark:bg-emerald-500/10" />
      </div>

      <header className="mb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 커뮤니티
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl font-bold tracking-tight break-keep">{isBriefing ? "해외 브리핑" : isFreeBoard ? "자유게시판" : "스포츠 분석"}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/experts"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2.5 text-sm font-semibold ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:ring-white/15 dark:hover:bg-white/10"
            >
              <Trophy className="h-4 w-4" aria-hidden /> 랭킹
            </Link>
            {!isBriefing && (
            <Link
              href={isFreeBoard ? "/community/new" : "/analysis/new"}
              className="group inline-flex items-center gap-2 rounded-full bg-rose-600 py-2 pl-5 pr-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(225,29,72,0.6)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.02] hover:bg-rose-700 active:scale-[0.98]"
            >
              글쓰기
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
                <SquarePen className="h-3.5 w-3.5" aria-hidden />
              </span>
            </Link>
            )}
          </div>
        </div>
        <p className="mt-4 max-w-2xl leading-relaxed text-neutral-600 break-keep dark:text-neutral-400">
          {isBriefing
            ? "BBC·스카이스포츠·디 애슬레틱 등 공신력 있는 해외 보도만 골라 사실 기반으로 재구성해 전합니다. 찌라시 없음, 출처는 글마다 명시."
            : isFreeBoard
              ? "잡담부터 드림팀 자랑, 전술판 공유까지 자유롭게."
              : "회원이 올린 경기 분석·승부 예측이 실제 결과로 자동 채점되어 적중률·랭킹에 반영됩니다."}
        </p>

        {/* 보드 탭 — 스포츠 분석 | 자유게시판 | 해외 브리핑 (한 커뮤니티, 세 보드) */}
        <div className="mt-5 inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
          <Link
            href="/analysis"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${!isFreeBoard && !isBriefing ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
          >
            스포츠 분석
          </Link>
          <Link
            href="/analysis?board=free"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${isFreeBoard ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
          >
            자유게시판
          </Link>
          <Link
            href="/analysis?board=briefing"
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${isBriefing ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"}`}
          >
            해외 브리핑
          </Link>
        </div>

        {!isFreeBoard && !isBriefing && (
        <details className="group mt-5 rounded-2xl bg-white/60 px-5 py-4 ring-1 ring-black/5 backdrop-blur dark:bg-white/[0.04] dark:ring-white/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2"><Target className="h-4 w-4 shrink-0 text-rose-500" aria-hidden /> 적중률은 어떻게 채점되나요? (= 승률이 아닙니다)</span>
            <span className="shrink-0 text-neutral-400 transition-transform duration-300 group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            <p>
              적중률은 회원이{" "}
              <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
                예정 경기에 직접 건 픽
              </strong>
              이 실제 결과와 맞았는지의 비율입니다. 경기가 끝나면 실제 스코어로 자동 채점돼요.
            </p>
            <p>
              픽은 마켓별로 판정합니다 — <strong>승무패</strong>(예측한 승자 = 실제 승자),{" "}
              <strong>핸디캡</strong>(라인 적용 후 승패), <strong>오버언더</strong>(총득점 vs 기준선).
              무승부 없는 종목의 동점·핸디캡/오버언더 푸시는 무효 처리됩니다.
            </p>
            <p>
              즉 적중률은{" "}
              <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
                “팀이 이길 확률(승률)”이나 단순 승패 기록이 아니라 “내 예측이 맞았는가”
              </strong>
              입니다. 랭킹에 보이는 “N승 M패”도 사실은 <strong>N적중 · M빗나감</strong>을 뜻해요.
            </p>
            <p>
              랭킹 순서도 단순 적중률(%)이 아니라{" "}
              <strong className="font-semibold text-neutral-800 dark:text-neutral-200">
                표본 수를 반영한 신뢰도 보정(Wilson 점수 하한)
              </strong>
              으로 정렬됩니다. 그래서 1경기 100%가 무조건 1등이 되지 않고, 많이·꾸준히 맞춘 회원이 위로 올라갑니다.
            </p>
          </div>
        </details>
        )}
      </header>

      {/* 종목·말머리 필터 탭 — 브리핑 보드는 전부 축구라 탭 없음 */}
      {!isBriefing && (
      <nav className="mb-6 flex flex-wrap items-center gap-2" aria-label="종목 필터">
        <Link
          href={href(1, null)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            !sportFilter
              ? "bg-neutral-900 text-white ring-neutral-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900 dark:ring-white"
              : "bg-white/60 text-neutral-600 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
          }`}
        >
          전체 <span className="opacity-50 tabular-nums">{totalAll}</span>
        </Link>
        {(isFreeBoard ? FREE_TABS : SPORT_TABS).map((s) => {
          const n = s.code === "talk" ? talkCount : (countBySport.get(s.code) ?? 0);
          const active = sportFilter === s.code;
          return (
            <Link
              key={s.code}
              href={href(1, s.code)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                active
                  ? "bg-neutral-900 text-white ring-neutral-900 shadow-[0_8px_24px_-10px_rgba(0,0,0,0.5)] dark:bg-white dark:text-neutral-900 dark:ring-white"
                  : "bg-white/60 text-neutral-600 ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
              }`}
            >
              {s.label}
              {n > 0 && <span className="ml-1 opacity-50 tabular-nums">{n}</span>}
            </Link>
          );
        })}
      </nav>
      )}

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500 py-24 text-center">
          {isBriefing
            ? "아직 브리핑이 없습니다. 곧 첫 소식이 올라옵니다."
            : isFreeBoard
              ? "아직 글이 없습니다. 첫 글의 주인공이 되어보세요!"
              : sportFilter
                ? `${SPORT_META[sportFilter].label} 분석글이 아직 없습니다. 첫 글을 남겨보세요!`
                : "아직 등록된 분석글이 없습니다. 첫 글을 남겨보세요!"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-[1.75rem] bg-white ring-1 ring-black/5 shadow-[0_28px_70px_-34px_rgba(15,23,30,0.35)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          {/* header row (desktop) */}
          <div
            className={`hidden sm:grid ${COLS} gap-3 px-6 py-3.5 bg-neutral-50/80 dark:bg-white/[0.03] text-[11px] uppercase tracking-wider font-semibold text-neutral-400 dark:text-neutral-500 border-b border-black/5 dark:border-white/5`}
          >
            <span>분류</span>
            <span>제목</span>
            <span>작성자</span>
            <span className="text-right">배당</span>
            <span className="text-right">등록일</span>
            <span className="text-right">조회</span>
            <span className="text-right">추천</span>
          </div>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {posts.map((p) => {
              const g = displayGrade(p.author.level, p.author.badge);
              const a = p.author;
              const odds = pickOdds(p.market, p.pick, p.match);
              return (
                <li key={p.id}>
                  <Link
                    href={`/analysis/${p.id}`}
                    className={`group grid grid-cols-[1fr] ${COLS} gap-3 px-6 py-4 items-center transition-colors duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-neutral-50 dark:hover:bg-white/[0.03]`}
                  >
                    <span className="hidden sm:flex flex-col gap-1">
                      {p.category === "BRIEFING" ? (
                        <span className="w-fit rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">해외</span>
                      ) : p.category === "FREE" ? (
                        <span className="w-fit rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400">자유</span>
                      ) : (
                        <span className="w-fit rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">분석</span>
                      )}
                      <span className="text-[11px] font-semibold text-neutral-500">
                        {p.category === "BRIEFING" ? null : p.sport && SPORT_META[p.sport] ? SPORT_META[p.sport].label : p.category === "FREE" ? "잡담" : null}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {p.isCorrect === true && (
                          <span
                            title="예측 적중"
                            className="shrink-0 text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 text-yellow-950 shadow-[0_0_8px_rgba(234,179,8,0.55)]"
                          >
                            ✓적중
                          </span>
                        )}
                        {p.isCorrect === false && (
                          <X className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-label="예측 미적중" />
                        )}
                        <span className="truncate font-semibold text-base transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400">{p.title}</span>
                        {p.dreamTeamId && (
                          <span className="shrink-0 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-600 dark:text-rose-400">드림팀</span>
                        )}
                        {p.lineupCode && (
                          <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">전술판</span>
                        )}
                        {p.commentCount > 0 && (
                          <span className="shrink-0 text-xs font-semibold text-rose-500">
                            [{p.commentCount}]
                          </span>
                        )}
                      </span>
                      {/* mobile meta */}
                      <span className="sm:hidden mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
                        {p.sport && SPORT_META[p.sport] && (
                          <span className="font-medium">{SPORT_META[p.sport].label}</span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <AuthorBadge avatarUrl={a.avatarUrl} nickname={a.nickname} level={a.level} badge={a.badge} size="h-6 w-6 text-sm" />
                          {a.nickname}
                        </span>
                        {a.predTotal > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <Target className="h-3 w-3" aria-hidden />{hitRate(a.predHit, a.predTotal)}%
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-neutral-400">
                            <Target className="h-3 w-3" aria-hidden /> 기록없음
                          </span>
                        )}
                        {odds != null && (
                          <>
                            <span>·</span>
                            <span className="text-rose-500 font-bold">@{fmtOdds(odds)}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>{listDate(p.createdAt)}</span>
                      </span>
                    </span>
                    <span
                      className="hidden sm:flex items-center gap-2.5 text-sm text-neutral-600 dark:text-neutral-400 min-w-0"
                      title={g.name}
                    >
                      <AuthorBadge avatarUrl={a.avatarUrl} nickname={a.nickname} level={a.level} badge={a.badge} size="h-10 w-10 text-xl" />
                      <span className="flex flex-col min-w-0">
                        <span className="truncate">{a.nickname}</span>
                        {a.predTotal > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <Target className="h-3 w-3" aria-hidden /> {hitRate(a.predHit, a.predTotal)}% ({a.predHit}/{a.predTotal})
                            {a.predStreak >= 2 && (
                              <span className="inline-flex items-center gap-0.5 ml-0.5">
                                <Flame className="h-3 w-3" aria-hidden />{a.predStreak}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                            <Target className="h-3 w-3" aria-hidden /> 예측 기록 없음
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className="hidden sm:block text-right text-sm font-bold tabular-nums"
                      title={odds != null ? "내 픽 배당" : undefined}
                    >
                      {odds != null ? (
                        <span className="text-rose-500">{fmtOdds(odds)}</span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-700">–</span>
                      )}
                    </span>
                    <span className="hidden sm:block text-right text-sm text-neutral-500">
                      {listDate(p.createdAt)}
                    </span>
                    <span className="hidden sm:block text-right text-sm text-neutral-500">
                      {p.views}
                    </span>
                    <span className="hidden sm:block text-right text-sm font-semibold text-rose-500">
                      {p.likes}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center items-center gap-1.5 mt-8">
          {cur > 1 && (
            <Link
              href={href(cur - 1)}
              className="px-3.5 py-2 rounded-full text-sm ring-1 ring-black/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"
            >
              ‹
            </Link>
          )}
          {pageList(cur, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`e${i}`} className="px-2 text-neutral-400">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                className={`px-4 py-2 rounded-full text-sm font-semibold ring-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  p === cur
                    ? "bg-rose-600 text-white ring-rose-600 shadow-[0_8px_24px_-10px_rgba(225,29,72,0.6)]"
                    : "ring-black/10 hover:-translate-y-0.5 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"
                }`}
              >
                {p}
              </Link>
            ),
          )}
          {cur < totalPages && (
            <Link
              href={href(cur + 1)}
              className="px-3.5 py-2 rounded-full text-sm ring-1 ring-black/10 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"
            >
              ›
            </Link>
          )}
        </nav>
      )}

      {!userId && (
        <p className="mt-5 text-sm text-neutral-500 text-center">
          글쓰기·추천은{" "}
          <Link href="/login?from=/analysis" className="text-blue-600 dark:text-blue-400 underline">
            로그인
          </Link>{" "}
          후 가능합니다.
        </p>
      )}

      {/* SEO 본문 — 게시판 소개 + 차별화(적중 자동채점) + 가치 페이지 내부링크 */}
      <section className="mt-14 border-t border-black/5 dark:border-white/10 pt-8 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          스포츠 분석 게시판이란?
        </h2>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          스코어베이스 분석 게시판은 회원이 직접 축구·야구·농구·하키 경기를 분석하고
          승부를 예측하는 커뮤니티입니다. 다른 사이트와 달리{" "}
          <strong>모든 예측은 실제 경기 결과로 자동 채점</strong>되어, 적중률·연승
          기록이 작성자 프로필과{" "}
          <Link href="/experts" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            예측 랭킹
          </Link>
          에 그대로 남습니다. 감이 아니라 검증된 기록으로 실력을 증명할 수 있습니다.
        </p>
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          스코어베이스 AI 모델의 예측 적중률은{" "}
          <Link href="/predictions/accuracy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            적중률 보드
          </Link>
          에서, 리그별 시즌 우승 확률은{" "}
          <Link href="/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            시즌 예측
          </Link>
          에서 데이터로 확인할 수 있습니다.
        </p>
      </section>
    </main>
  );
}
