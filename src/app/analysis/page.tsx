// 스포츠 분석 게시판 — 회원·봇 승부예측 글 목록 + 적중 자동채점·종목 필터.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { displayGrade } from "@/lib/user-level";
import { getCurrentUserId } from "@/lib/current-user";
import { listTime, hitRate } from "@/lib/analysis/format";
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
    title: "스포츠 분석 게시판 — 스코어베이스",
    description: "회원 경기 분석·승부 예측 + 적중 자동채점·랭킹.",
    url: `${SITE_URL}/analysis`,
  },
};

// 구조화 데이터 (CollectionPage) — 분석 커뮤니티를 콘텐츠 페이지로 인식.
const ANALYSIS_JSONLD = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: "스포츠 분석 게시판 — 스코어베이스",
  description:
    "회원이 직접 올리는 축구·야구·농구·하키 경기 분석과 승부 예측. 예측 적중은 실제 경기 결과로 자동 채점됩니다.",
  url: `${SITE_URL}/analysis`,
  isPartOf: { "@type": "WebSite", name: "스코어베이스", url: SITE_URL },
  about: "스포츠 경기 분석 및 승부 예측 커뮤니티",
  inLanguage: "ko-KR",
};

// 데스크탑 그리드 컬럼 — 제목(1fr)을 넓게, 나머지는 고정폭. 작성자 뒤·등록일 앞 배당 컬럼.
const COLS = "sm:grid-cols-[72px_minmax(0,1fr)_180px_70px_96px_80px_72px]";

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

interface Props {
  searchParams: Promise<{ page?: string; sport?: string }>;
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
  size = "h-8 w-8 text-base",
}: {
  avatarUrl: string | null;
  nickname: string;
  size?: string;
}) {
  const av = resolveAvatar(avatarUrl, nickname);
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
  const { page, sport } = await searchParams;
  const cur = Math.max(1, Number(page) || 1);
  const sportFilter = SPORT_META[sport ?? ""] ? sport! : null;
  const href = (p: number, s: string | null = sportFilter) => {
    const q = new URLSearchParams();
    if (s) q.set("sport", s);
    if (p > 1) q.set("page", String(p));
    const qs = q.toString();
    return qs ? `/analysis?${qs}` : "/analysis";
  };
  const [posts, sportCounts, userId] = await Promise.all([
    prisma.post.findMany({
      where: sportFilter ? { sport: sportFilter } : {},
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
    prisma.post.groupBy({ by: ["sport"], _count: true }),
    getCurrentUserId(),
  ]);
  const countBySport = new Map(sportCounts.map((g) => [g.sport, g._count]));
  const totalAll = sportCounts.reduce((s, g) => s + g._count, 0);
  const total = sportFilter ? (countBySport.get(sportFilter) ?? 0) : totalAll;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ANALYSIS_JSONLD) }}
      />
      <header className="mb-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm text-neutral-500 mb-2">커뮤니티</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">스포츠 분석</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/experts"
              className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 px-4 py-2.5 text-sm font-semibold transition"
            >
              <Trophy className="h-4 w-4" aria-hidden /> 랭킹
            </Link>
            <Link
              href="/analysis/new"
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white px-5 py-2.5 text-sm font-semibold transition"
            >
              <SquarePen className="h-4 w-4" aria-hidden /> 글쓰기
            </Link>
          </div>
        </div>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          회원이 올린 경기 분석·승부 예측이 실제 결과로 자동 채점되어 적중률·랭킹에 반영됩니다.
        </p>

        <details className="group mt-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-neutral-800 dark:text-neutral-200 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5"><Target className="h-4 w-4 shrink-0" aria-hidden /> 적중률은 어떻게 채점되나요? (= 승률이 아닙니다)</span>
            <span className="shrink-0 text-neutral-400 transition-transform duration-200 group-open:rotate-45">+</span>
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
      </header>

      {/* 종목 필터 탭 */}
      <nav className="mb-5 flex flex-wrap items-center gap-1.5" aria-label="종목 필터">
        <Link
          href={href(1, null)}
          className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
            !sportFilter
              ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
              : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          }`}
        >
          전체 <span className="opacity-60 tabular-nums">{totalAll}</span>
        </Link>
        {SPORT_TABS.map((s) => {
          const n = countBySport.get(s.code) ?? 0;
          const active = sportFilter === s.code;
          return (
            <Link
              key={s.code}
              href={href(1, s.code)}
              className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                active
                  ? "bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-900 dark:border-white"
                  : "border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
            >
              {s.label}
              {n > 0 && <span className="ml-1 opacity-60 tabular-nums">{n}</span>}
            </Link>
          );
        })}
      </nav>

      {posts.length === 0 ? (
        <p className="text-sm text-neutral-500 py-24 text-center">
          {sportFilter
            ? `${SPORT_META[sportFilter].label} 분석글이 아직 없습니다. 첫 글을 남겨보세요!`
            : "아직 등록된 분석글이 없습니다. 첫 글을 남겨보세요!"}
        </p>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80">
          {/* header row (desktop) */}
          <div
            className={`hidden sm:grid ${COLS} gap-4 px-6 py-3.5 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold text-neutral-500 border-b border-neutral-200 dark:border-neutral-800`}
          >
            <span>분류</span>
            <span>제목</span>
            <span>작성자</span>
            <span className="text-right">배당</span>
            <span className="text-right">등록일</span>
            <span className="text-right">조회</span>
            <span className="text-right">추천</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800/70">
            {posts.map((p) => {
              const g = displayGrade(p.author.level, p.author.badge);
              const a = p.author;
              const odds = pickOdds(p.market, p.pick, p.match);
              return (
                <li key={p.id}>
                  <Link
                    href={`/analysis/${p.id}`}
                    className={`grid grid-cols-[1fr] ${COLS} gap-4 px-6 py-4 items-center hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition`}
                  >
                    <span className="hidden sm:flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-blue-600 dark:text-blue-400">분석</span>
                      {p.sport && SPORT_META[p.sport] && (
                        <span className="text-[11px] font-semibold text-neutral-500">
                          {SPORT_META[p.sport].label}
                        </span>
                      )}
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
                        <span className="truncate font-semibold text-base">{p.title}</span>
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
                          <AuthorBadge avatarUrl={a.avatarUrl} nickname={a.nickname} size="h-6 w-6 text-sm" />
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
                        <span>{listTime(p.createdAt)}</span>
                      </span>
                    </span>
                    <span
                      className="hidden sm:flex flex-col justify-center text-sm text-neutral-600 dark:text-neutral-400 min-w-0"
                      title={g.name}
                    >
                      <span className="flex items-center gap-1.5">
                        <AuthorBadge avatarUrl={a.avatarUrl} nickname={a.nickname} />
                        <span className="truncate">{a.nickname}</span>
                      </span>
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
                      {listTime(p.createdAt)}
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
        <nav className="flex justify-center items-center gap-1.5 mt-6">
          {cur > 1 && (
            <Link
              href={href(cur - 1)}
              className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition ${
                  p === cur
                    ? "bg-rose-600 text-white border-rose-600"
                    : "border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                }`}
              >
                {p}
              </Link>
            ),
          )}
          {cur < totalPages && (
            <Link
              href={href(cur + 1)}
              className="px-3 py-1.5 rounded-lg text-sm border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
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
      <section className="mt-12 border-t border-neutral-200 dark:border-neutral-800 pt-8 space-y-3">
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
