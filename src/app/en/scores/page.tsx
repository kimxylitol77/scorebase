// /en/scores — 영어판 라이브 스코어. DB Match 가 폴러로 실시간 갱신되는 단일 소스라
// ko /scores 의 ESPN 오버레이 없이 DB 직조회 린 버전으로 구성. LIVE 있으면 60초 자동 새로고침.
// 날짜는 UTC 달력일 기준(?date=YYYY-MM-DD) — 글로벌 방문자 대상이라 KST 를 강제하지 않는다.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import AutoRefresh from "@/components/en/AutoRefresh";
import LocalKickoff from "@/components/en/LocalKickoff";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { SPORTS } from "@/lib/sports/sport-leagues";
import { enLeagueName, toEnglishTeamName, SPORT_LABEL_EN } from "@/lib/i18n/en";

export const metadata: Metadata = {
  title: "Live Scores — Football, Baseball, Basketball & More",
  description:
    "Live scores, results and fixtures across 40+ football leagues plus MLB, KBO, NPB, NBA, NHL and volleyball — updated around the clock.",
  alternates: {
    canonical: `${SITE_URL}/en/scores`,
    languages: {
      ko: `${SITE_URL}/scores`,
      en: `${SITE_URL}/en/scores`,
      "x-default": `${SITE_URL}/scores`,
    },
  },
};

// e스포츠는 팀명 일부가 DB 한글 저장이라 v1 제외 (표시 언어 오염 방지)
const EXCLUDED_SPORTS = new Set(["esports"]);
const SPORT_ORDER = ["soccer", "baseball", "basketball", "hockey", "volleyball", "mma"];

const LEAGUE_TO_SPORT = new Map<string, string>();
for (const s of SPORTS) {
  if (s.code === "all" || EXCLUDED_SPORTS.has(s.code)) continue;
  for (const lg of s.leagues) if (!LEAGUE_TO_SPORT.has(lg)) LEAGUE_TO_SPORT.set(lg, s.code);
}

interface Props {
  searchParams: Promise<{ date?: string }>;
}

function utcDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Row {
  id: number;
  league: string;
  status: string;
  startTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  home: string;
  away: string;
}

function StatusCell({ m }: { m: Row }) {
  if (m.status === "LIVE") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
        </span>
        LIVE
      </span>
    );
  }
  if (m.status === "FINISHED") return <span className="text-[11px] font-semibold text-neutral-400">FT</span>;
  if (m.status === "POSTPONED") return <span className="text-[11px] text-neutral-400">Postponed</span>;
  return (
    <span className="text-[11px] tabular-nums text-neutral-500">
      <LocalKickoff iso={m.startTime.toISOString()} withDate={false} />
    </span>
  );
}

function MatchRow({ m }: { m: Row }) {
  const played = m.status === "LIVE" || m.status === "FINISHED";
  return (
    <div className="grid grid-cols-[64px_1fr_auto_1fr] items-center gap-2 px-3 py-2 text-sm">
      <StatusCell m={m} />
      <span className={`truncate text-right ${played && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore ? "font-bold" : ""}`}>
        {m.home}
      </span>
      <span className="min-w-[44px] text-center tabular-nums">
        {played && m.homeScore != null ? (
          <span className={`font-bold ${m.status === "LIVE" ? "text-rose-600 dark:text-rose-400" : ""}`}>
            {m.homeScore} : {m.awayScore}
          </span>
        ) : (
          <span className="text-neutral-400">vs</span>
        )}
      </span>
      <span className={`truncate ${played && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore ? "font-bold" : ""}`}>
        {m.away}
      </span>
    </div>
  );
}

export default async function EnScores({ searchParams }: Props) {
  const { date } = await searchParams;
  const today = utcDateStr(new Date());
  const dateStr = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const prev = utcDateStr(new Date(dayStart.getTime() - 43200000));
  const next = utcDateStr(new Date(dayEnd.getTime() + 43200000));

  const matches = await prisma.match.findMany({
    where: { startTime: { gte: dayStart, lt: dayEnd } },
    select: {
      id: true,
      league: true,
      status: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  // 종목 → 리그 → 매치 그룹핑 (미지원 종목·미매핑 리그 제외)
  const bySport = new Map<string, Map<string, Row[]>>();
  let liveCount = 0;
  for (const m of matches) {
    const sport = LEAGUE_TO_SPORT.get(m.league);
    if (!sport) continue;
    const row: Row = {
      id: m.id,
      league: m.league,
      status: m.status,
      startTime: m.startTime,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      home: toEnglishTeamName(m.homeTeam.name),
      away: toEnglishTeamName(m.awayTeam.name),
    };
    if (m.status === "LIVE") liveCount++;
    if (!bySport.has(sport)) bySport.set(sport, new Map());
    const byLeague = bySport.get(sport)!;
    if (!byLeague.has(m.league)) byLeague.set(m.league, []);
    byLeague.get(m.league)!.push(row);
  }

  const sportsToShow = SPORT_ORDER.filter((s) => bySport.has(s));
  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(dayStart);

  return (
    <main className="relative mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <AmbientGlow />
      <AutoRefresh enabled={liveCount > 0} />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> Scores
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Live scores &amp; results</h1>
        <p className="text-sm text-neutral-500">
          {liveCount > 0
            ? `${liveCount} ${liveCount === 1 ? "match" : "matches"} in play — auto-refreshing every minute.`
            : "Fixtures and results by day. Times shown in your local timezone."}
        </p>
      </header>

      {/* 날짜 네비 — UTC 달력일 */}
      <nav className="flex items-center gap-2 text-sm">
        <Link
          href={`/en/scores?date=${prev}`}
          prefetch={false}
          className="rounded-full px-3 py-1.5 font-medium text-neutral-500 ring-1 ring-black/10 transition hover:text-neutral-900 dark:ring-white/15 dark:hover:text-white"
        >
          ← Prev
        </Link>
        <span className="rounded-full bg-neutral-900 px-4 py-1.5 font-semibold text-white dark:bg-white dark:text-neutral-900">
          {dayLabel}
          {dateStr === today && " · Today"}
        </span>
        <Link
          href={`/en/scores?date=${next}`}
          prefetch={false}
          className="rounded-full px-3 py-1.5 font-medium text-neutral-500 ring-1 ring-black/10 transition hover:text-neutral-900 dark:ring-white/15 dark:hover:text-white"
        >
          Next →
        </Link>
        {dateStr !== today && (
          <Link href="/en/scores" prefetch={false} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
            Back to today
          </Link>
        )}
      </nav>

      {sportsToShow.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500 dark:border-white/15">
          No matches on this day.
        </p>
      ) : (
        sportsToShow.map((sport) => {
          const byLeague = bySport.get(sport)!;
          const sportMeta = SPORTS.find((s) => s.code === sport);
          return (
            <section key={sport} className="space-y-4">
              <h2 className="flex items-center gap-2 border-b border-neutral-200 pb-2 text-xl font-bold tracking-tight dark:border-white/10">
                <span>{sportMeta?.emoji}</span>
                {SPORT_LABEL_EN[sport] ?? sport}
              </h2>
              {Array.from(byLeague.entries()).map(([league, rows]) => (
                <div key={league} className="overflow-hidden rounded-2xl border border-neutral-200 dark:border-white/10">
                  <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-neutral-500 dark:border-white/10 dark:bg-white/[0.03]">
                    {enLeagueName(league)}
                  </div>
                  <div className="divide-y divide-neutral-100 dark:divide-white/5">
                    {rows.map((m) => (
                      <MatchRow key={m.id} m={m} />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          );
        })
      )}

      <section className="border-t border-neutral-200 pt-6 dark:border-white/10">
        <p className="text-sm text-neutral-500">
          Want win probabilities for upcoming matches? See{" "}
          <Link href="/en/predictions" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            AI predictions
          </Link>{" "}
          — with{" "}
          <Link href="/en/predictions/accuracy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            published accuracy
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
