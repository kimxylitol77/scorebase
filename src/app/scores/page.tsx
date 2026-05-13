// /scores — 라이브/종료/예정 통합 스코어 페이지.
// 종목 탭 (전체·축구·야구·농구·하키·e스포츠) + 일자 nav (어제·오늘·내일) + 리그 그룹화.
// 라이브 매치는 ScoresLiveCards (client) 가 별도 polling.

import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import {
  SPORTS,
  leaguesForSport,
  LEAGUE_DISPLAY,
  LEAGUE_ORDER,
  type SportCode,
} from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import LeagueBadge from "@/components/LeagueBadge";
import ScoresLiveCards from "@/components/ScoresLiveCards";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; sport?: string }>;
}

export const metadata: Metadata = {
  title: "라이브 스코어 — 모든 리그 실시간",
  description:
    "EPL · KBO · NPB · MLB · NBA · NHL · UCL · LCK 13개 리그의 라이브 / 종료 / 예정 매치를 한 페이지에. 30초 자동 갱신.",
  alternates: { canonical: "https://www.scorebase.kr/scores" },
};

function parseKstDate(s: string | undefined): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00+09:00`);
  }
  // 오늘 (KST 자정)
  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  return new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      -9, // KST 0시 = UTC 전날 15시 → KST 자정을 UTC 로 변환
    ),
  );
}

function kstDateLabel(d: Date): string {
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function kstHHmm(d: Date): string {
  return d.toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dateQuery(d: Date): string {
  // KST 기준 yyyy-mm-dd
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

export default async function ScoresPage({ searchParams }: Props) {
  const sp = await searchParams;
  const sport = (
    SPORTS.find((s) => s.code === sp.sport)?.code ?? "all"
  ) as SportCode;
  const leagues = leaguesForSport(sport);
  const day = parseKstDate(sp.date);
  const dayEnd = new Date(day.getTime() + 24 * 3600 * 1000);
  const prev = new Date(day.getTime() - 24 * 3600 * 1000);
  const next = new Date(day.getTime() + 24 * 3600 * 1000);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      startTime: { gte: day, lt: dayEnd },
    },
    include: {
      homeTeam: true,
      awayTeam: true,
      // 매치별 PREVIEW/RECAP article — 클릭 시 deep-link 용
      articles: {
        where: { status: "PUBLISHED" },
        select: { slug: true, type: true },
      },
    },
    orderBy: { startTime: "asc" },
  });

  // status 별로 어떤 article 을 우선할지 결정 — FINISHED 면 RECAP, 그 외 PREVIEW
  function pickArticleSlug(
    status: string,
    arts: { slug: string; type: string }[],
  ): string | null {
    if (arts.length === 0) return null;
    const preferType = status === "FINISHED" ? "RECAP" : "PREVIEW";
    const preferred = arts.find((a) => a.type === preferType);
    return (preferred ?? arts[0]).slug;
  }

  // 리그별 그룹화 + 우선순위 정렬
  const byLeague = new Map<string, typeof matches>();
  for (const m of matches) {
    if (!byLeague.has(m.league)) byLeague.set(m.league, []);
    byLeague.get(m.league)!.push(m);
  }
  const groups = [...byLeague.entries()].sort(([a], [b]) => {
    return (LEAGUE_ORDER[a] ?? 99) - (LEAGUE_ORDER[b] ?? 99);
  });

  const totalCount = matches.length;
  const liveCount = matches.filter((m) => m.status === "LIVE").length;
  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 py-6 sm:py-8 space-y-5">
      {/* 헤더 */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
          라이브 스코어
        </h1>
        <p className="text-sm text-neutral-500">
          {kstDateLabel(day)} · 총 {totalCount}경기
          {liveCount > 0 && (
            <span className="ml-2 text-rose-600 dark:text-rose-400 font-semibold">
              ● LIVE {liveCount}
            </span>
          )}
          {finishedCount > 0 && (
            <span className="ml-2 text-neutral-400">종료 {finishedCount}</span>
          )}
          {scheduledCount > 0 && (
            <span className="ml-2 text-neutral-400">예정 {scheduledCount}</span>
          )}
        </p>
      </header>

      {/* 라이브 매치 (외부 API 실시간 스코어) */}
      <ScoresLiveCards sport={sport} />

      {/* 종목 탭 */}
      <nav className="flex gap-1 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {SPORTS.map((s) => {
          const active = s.code === sport;
          const dateStr = sp.date ?? dateQuery(day);
          return (
            <Link
              key={s.code}
              href={`/scores?sport=${s.code}&date=${dateStr}`}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                active
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              }`}
            >
              <span aria-hidden>{s.emoji}</span>
              {s.label}
            </Link>
          );
        })}
      </nav>

      {/* 일자 nav */}
      <div className="flex items-center justify-between text-sm">
        <Link
          href={`/scores?sport=${sport}&date=${dateQuery(prev)}`}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
        >
          ← 어제
        </Link>
        <div className="font-semibold tabular-nums">{kstDateLabel(day)}</div>
        <Link
          href={`/scores?sport=${sport}&date=${dateQuery(next)}`}
          className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
        >
          내일 →
        </Link>
      </div>

      {/* 리그 그룹 list */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-neutral-500 text-sm">
          이 날짜 / 종목 조합엔 매치가 없습니다.
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([league, list]) => (
            <section key={league}>
              <div className="flex items-center justify-between mb-2">
                <Link
                  href={`/leagues/${league}`}
                  className="inline-flex items-center gap-2 hover:opacity-80 transition"
                >
                  <LeagueBadge league={league} size="md" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em] text-neutral-500">
                    {LEAGUE_DISPLAY[league] ?? league}
                  </span>
                </Link>
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  {list.length}경기
                </span>
              </div>
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden bg-white dark:bg-neutral-950">
                {list.map((m) => {
                  const slug = pickArticleSlug(m.status, m.articles);
                  return (
                    <MatchRow
                      key={m.id}
                      homeName={toKoreanTeamName(m.homeTeam.name)}
                      awayName={toKoreanTeamName(m.awayTeam.name)}
                      homeScore={m.homeScore}
                      awayScore={m.awayScore}
                      status={m.status}
                      timeLabel={kstHHmm(m.startTime)}
                      href={
                        slug ? `/articles/${slug}` : `/leagues/${m.league}`
                      }
                      hasArticle={!!slug}
                    />
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="text-[11px] text-neutral-500 leading-relaxed pt-2">
        ⓘ 라이브 스코어는 30초 자동 갱신. 종료·예정 매치는 우리 매치 DB 의 일자별 일정.
      </p>
    </div>
  );
}

function MatchRow({
  homeName,
  awayName,
  homeScore,
  awayScore,
  status,
  timeLabel,
  href,
  hasArticle,
}: {
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  timeLabel: string;
  href: string;
  hasArticle: boolean;
}) {
  const isLive = status === "LIVE";
  const isFinished = status === "FINISHED";
  const statusBadge = isLive ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
      LIVE
    </span>
  ) : isFinished ? (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      종료
    </span>
  ) : (
    <span className="text-[11px] font-medium text-neutral-400 tabular-nums">
      {timeLabel}
    </span>
  );

  return (
    <li className="group relative hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition">
      <Link
        href={href}
        className="block px-3 sm:px-4 py-3 flex items-center gap-3 sm:gap-4 text-sm"
        prefetch={false}
      >
        <div className="shrink-0 w-12 sm:w-14 flex items-center justify-center">
          {statusBadge}
        </div>
        <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-center">
          <div className="text-right truncate font-medium">{awayName}</div>
          <div className="text-center font-black tabular-nums tracking-tight min-w-[3rem]">
            {homeScore != null && awayScore != null ? (
              <span className={isLive ? "text-rose-600 dark:text-rose-400" : ""}>
                {awayScore} - {homeScore}
              </span>
            ) : (
              <span className="text-neutral-300 dark:text-neutral-600">vs</span>
            )}
          </div>
          <div className="truncate font-medium">{homeName}</div>
        </div>
        <span
          className={`hidden sm:inline-block shrink-0 text-[10px] font-medium ${
            hasArticle
              ? "text-blue-600 dark:text-blue-400"
              : "text-neutral-300 dark:text-neutral-700"
          }`}
          title={hasArticle ? "글 보기" : "글 없음"}
        >
          {hasArticle ? "글 →" : "—"}
        </span>
      </Link>
      {/* 데스크탑 호버 popover — 매치 메타 (시간 풀, 리그 풀명) */}
      <div className="hidden sm:block pointer-events-none absolute z-20 left-1/2 -translate-x-1/2 top-full mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-lg px-3 py-2 text-xs whitespace-nowrap">
          <div className="font-semibold text-neutral-900 dark:text-white">
            {awayName} <span className="text-neutral-400">vs</span> {homeName}
          </div>
          <div className="mt-0.5 text-neutral-500">
            {isLive
              ? "● 진행 중"
              : isFinished
                ? `종료 · ${awayScore ?? 0} - ${homeScore ?? 0}`
                : `예정 · KST ${timeLabel}`}
            {hasArticle && (
              <span className="ml-2 text-blue-600 dark:text-blue-400">
                · 분석 글 있음
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
