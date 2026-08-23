// /en/standings — 리그별 순위 허브 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchSoccerCountryGroups,
  fetchSportGroups,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "@/lib/sports/standings-overview";
import { SPORT_LABEL_EN } from "@/lib/i18n/en";
import { SPORTS } from "@/lib/sports/sport-leagues";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 600;

export const metadata: Metadata = {
  title: {
    absolute: "League Tables & Season Analysis — Scorebase",
  },
  description:
    "League tables and scoring leaderboards across football, baseball, basketball, hockey, volleyball and esports — Premier League, LaLiga, MLB, NBA, KBO, NHL and more, with Elo ratings and recent form.",
  alternates: {
    canonical: "https://www.scorebase.kr/en/standings",
    // 영어판(/en/standings) hreflang 상호 연결
    languages: {
      ko: "https://www.scorebase.kr/standings",
      en: "https://www.scorebase.kr/en/standings",
      "x-default": "https://www.scorebase.kr/standings",
    },
  },
};

interface LeagueCard {
  code: string;
  sport: string;
  name: string;
  subtitle: string;
  flag: string;
  gradient: string;
  href?: string; // 기본 /standings/{code}, 순위표 미지원 리그(LCK)는 override
}

// 종목 표시 순서 — UFC(mma)는 리그 순위표 개념이 없어 제외 (라이브/이벤트는 /live/ufc).
const SPORT_ORDER = ["soccer", "baseball", "basketball", "hockey", "volleyball", "esports"];

// 비축구 종목 주요 리그 카드. 축구는 아래 국가별 그룹(soccerGroups)이 전담.
const LEAGUES: LeagueCard[] = [
  { code: "MLB", sport: "baseball", name: "MLB", subtitle: "Major League Baseball", flag: "⚾", gradient: "from-emerald-500 via-green-600 to-teal-700" },
  { code: "KBO", sport: "baseball", name: "KBO League", subtitle: "Korean baseball", flag: "🇰🇷", gradient: "from-blue-600 via-indigo-600 to-rose-500" },
  { code: "NPB", sport: "baseball", name: "NPB", subtitle: "Japanese baseball", flag: "🇯🇵", gradient: "from-red-600 via-pink-500 to-rose-500" },
  { code: "NBA", sport: "basketball", name: "NBA", subtitle: "US basketball", flag: "🏀", gradient: "from-orange-500 via-amber-500 to-yellow-500" },
  // KBL/WKBL — 오프시즌엔 상세 페이지가 지난 시즌 최종 표를 라벨 붙여 서빙 (fetcher 자동 폴백)
  { code: "KBL", sport: "basketball", name: "KBL", subtitle: "Korean basketball", flag: "🇰🇷", gradient: "from-red-600 via-rose-600 to-orange-500" },
  { code: "WKBL", sport: "basketball", name: "WKBL", subtitle: "Korean women's basketball", flag: "🇰🇷", gradient: "from-purple-600 via-violet-600 to-indigo-600" },
  { code: "NHL", sport: "hockey", name: "NHL", subtitle: "North American ice hockey", flag: "🏒", gradient: "from-cyan-500 via-blue-600 to-indigo-700" },
  // V-리그 — 비시즌엔 지난 시즌(2025-26) 최종 순위를 라벨 붙여 노출. 10월 개막 후 subtitle 갱신.
  { code: "V_LEAGUE", sport: "volleyball", name: "V-League (men)", subtitle: "KOVO · 2025-26 final table", flag: "🇰🇷", gradient: "from-sky-600 via-blue-600 to-indigo-600" },
  { code: "V_LEAGUE_W", sport: "volleyball", name: "V-League (women)", subtitle: "KOVO · 2025-26 final table", flag: "🇰🇷", gradient: "from-rose-500 via-pink-500 to-fuchsia-600" },
  { code: "VNL", sport: "volleyball", name: "Volleyball Nations League", subtitle: "VNL · men's international", flag: "🏐", gradient: "from-amber-500 via-orange-500 to-red-500" },
  { code: "AVC_NATIONS_W", sport: "volleyball", name: "AVC Nations Cup", subtitle: "Women's volleyball", flag: "🏐", gradient: "from-sky-500 via-blue-500 to-indigo-600" },
  { code: "EGL_W", sport: "volleyball", name: "European Volleyball League", subtitle: "Women's volleyball · CEV", flag: "🏐", gradient: "from-violet-500 via-purple-500 to-fuchsia-500" },
  { code: "LOL", sport: "esports", name: "LCK", subtitle: "LoL · standings and players", flag: "🎮", gradient: "from-fuchsia-600 via-purple-600 to-indigo-600" },
  { code: "LEC", sport: "esports", name: "LEC", subtitle: "European LoL · standings and players", flag: "🎮", gradient: "from-sky-500 via-blue-600 to-indigo-700" },
  { code: "LCS", sport: "esports", name: "LCS", subtitle: "North American LoL · standings and players", flag: "🎮", gradient: "from-rose-500 via-red-600 to-orange-600" },
  { code: "LPL", sport: "esports", name: "LPL", subtitle: "Chinese LoL · group standings", flag: "🎮", gradient: "from-red-600 via-rose-600 to-pink-600" },
  { code: "EWC", sport: "esports", name: "Esports World Cup", subtitle: "LoL · group standings", flag: "🏆", gradient: "from-amber-500 via-yellow-500 to-orange-500" },
];

// 리그 카드 한 장 — gradient bar + 이름 + (있으면) 현재 순위 Top3 미리보기.
function LeagueCardItem({ card, top3 }: { card: LeagueCard; top3?: TopThreeEntry[] }) {
  return (
    <Link
      href={card.href ?? `/standings/${card.code}`}
      prefetch={false}
      className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_28px_70px_-30px_rgba(15,23,30,0.28)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.gradient}`} />
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">{card.flag}</span>
        <h3 className="text-lg font-bold tracking-tight group-hover:underline underline-offset-4 decoration-2">
          {card.name}
        </h3>
      </div>
      <div className="mt-1 text-xs text-neutral-500">{card.subtitle}</div>
      {top3 && top3.length > 0 && (
        <div className="mt-3 space-y-1">
          {top3.map((t) => (
            <div key={t.teamId} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="w-3 text-center tabular-nums font-bold text-neutral-400">{t.position}</span>
                <span className="truncate text-neutral-700 dark:text-neutral-300">{t.name}</span>
              </div>
              <span className="shrink-0 tabular-nums font-semibold text-neutral-500">{t.points}p</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 text-xs font-medium text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition flex items-center gap-1">
        {card.href ? "AI predictions" : "View table"}
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

// 축구 — 국가별 그룹(컵대회 제외, 현재 순위 있는 리그만). 리그 카드마다 Top3 미리보기.
function SoccerCountrySection({ groups }: { groups: CountryStandingsGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-neutral-300 dark:border-white/15 px-4 py-8 text-center text-sm text-neutral-500 break-keep">
        No football league is in season right now. Tables appear automatically once a season starts.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.country} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold">
            <span>{g.country}</span>
            <span className="text-xs font-normal text-neutral-400">{g.leagues.length} leagues</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {g.leagues.map((l) => (
              <Link
                key={l.league}
                href={`/standings/${l.league}`}
                prefetch={false}
                className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-[0_28px_70px_-30px_rgba(15,23,30,0.28)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/20 dark:hover:bg-white/[0.06]"
              >
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{l.leagueDisplay}</span>
                  <span className="text-xs text-neutral-400">→</span>
                </div>
                <div className="space-y-1">
                  {l.top3.map((t) => (
                    <div key={t.teamId} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="w-3 text-center tabular-nums font-bold text-neutral-400">{t.position}</span>
                        <span className="truncate text-neutral-700 dark:text-neutral-300">{t.name}</span>
                      </div>
                      <span className="shrink-0 tabular-nums font-semibold text-neutral-500">{t.points}p</span>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function StandingsRoot() {
  const [sportGroups, soccerGroups] = await Promise.all([
    fetchSportGroups(undefined, "en"),
    fetchSoccerCountryGroups("en"),
  ]);
  // 리그 → 현재 순위 Top3 (비축구 카드 미리보기용)
  const top3ByLeague = new Map<string, TopThreeEntry[]>();
  for (const g of [...sportGroups, ...soccerGroups]) {
    for (const l of g.leagues) top3ByLeague.set(l.league, l.top3);
  }

  const sportsToShow = SPORT_ORDER.map((code) => SPORTS.find((s) => s.code === code)).filter(
    (s): s is NonNullable<typeof s> => Boolean(s),
  );

  return (
    <main className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <AmbientGlow />
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> League tables
        </span>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">League Tables</h1>
        <p className="text-sm text-neutral-500 leading-relaxed break-keep">
          Season tables and scoring leaderboards across football, baseball, basketball, hockey, volleyball and esports.
          Tap a league for its full table and season leaders.
        </p>
      </header>

      {/* 종목 칩 앵커 */}
      <nav className="flex flex-wrap gap-2 text-sm">
        {sportsToShow.map((s) => (
          <a
            key={s.code}
            href={`#sport-${s.code}`}
            className="rounded-full bg-white/60 px-4 py-1.5 font-medium text-neutral-600 ring-1 ring-black/10 backdrop-blur transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-white dark:bg-white/5 dark:text-neutral-300 dark:ring-white/15 dark:hover:bg-white/10"
          >
            {s.emoji} {SPORT_LABEL_EN[s.code] ?? s.label}
          </a>
        ))}
      </nav>

      {/* 종목별 섹션 */}
      {sportsToShow.map((sport) => {
        const cards = LEAGUES.filter((l) => l.sport === sport.code);
        return (
          <section key={sport.code} id={`sport-${sport.code}`} className="space-y-4 scroll-mt-20">
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight border-b border-neutral-200 dark:border-white/10 pb-2 break-keep">
              <span className="text-2xl">{sport.emoji}</span>
              {SPORT_LABEL_EN[sport.code] ?? sport.label}
            </h2>

            {sport.code === "soccer" ? (
              <SoccerCountrySection groups={soccerGroups} />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map((card) => (
                  <LeagueCardItem key={card.code} card={card} top3={top3ByLeague.get(card.code)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* SEO 텍스트 */}
      <section className="mt-4 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-white/10 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight break-keep">
          League tables and season data
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
          Season tables for the Premier League, LaLiga, Bundesliga, Serie A, MLB, NBA, KBO and more — points, goal difference and home/away splits alongside Elo-based analysis. Each table also carries the season's scoring and assist leaders.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed break-keep">
          Live match progress is on{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Live scores
          </Link>
          , pre-match analysis on{" "}
          <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Previews
          </Link>
          , and post-match results on{" "}
          <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Reports
          </Link>
          .{" "}
          <Link href="/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            Injury lists
          </Link>
          are also worth a look.
        </p>
      </section>
    </main>
  );
}
