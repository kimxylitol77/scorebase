// /standings 인덱스 — 순위 허브: 종목별 섹션(축구·야구·농구·하키·배구·e스포츠) + 종목 칩 앵커.
// (2026-06-12 역할 분리 — /predictions 는 예측 요약, 순위 전체는 여기가 정본)
// (2026-06-20 종목 재편 — 종목 무관 16개 나열 → 종목 섹션. 각 리그 상세에 시즌 리더보드 추가)

import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchSoccerCountryGroups,
  fetchSportGroups,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "@/lib/sports/standings-overview";
import { SPORTS } from "@/lib/sports/sport-leagues";

export const revalidate = 600;

export const metadata: Metadata = {
  title: {
    absolute: "리그별 순위 및 시즌 분석 - 스코어베이스",
  },
  description:
    "축구·야구·농구·하키·배구·e스포츠 종목별 리그 순위와 득점왕·도움왕 리더보드. EPL·라리가·MLB·NBA·KBO·NHL 등 시즌 순위를 Elo 레이팅·최근 폼과 함께 정리.",
  alternates: { canonical: "https://www.scorebase.kr/standings" },
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
  { code: "MLB", sport: "baseball", name: "MLB", subtitle: "메이저리그", flag: "⚾", gradient: "from-emerald-500 via-green-600 to-teal-700" },
  { code: "KBO", sport: "baseball", name: "KBO 리그", subtitle: "한국 프로야구", flag: "🇰🇷", gradient: "from-blue-600 via-indigo-600 to-rose-500" },
  { code: "NPB", sport: "baseball", name: "NPB 리그", subtitle: "일본 프로야구", flag: "🇯🇵", gradient: "from-red-600 via-pink-500 to-rose-500" },
  { code: "NBA", sport: "basketball", name: "NBA", subtitle: "미국 프로농구", flag: "🏀", gradient: "from-orange-500 via-amber-500 to-yellow-500" },
  { code: "NHL", sport: "hockey", name: "NHL", subtitle: "북미 아이스하키", flag: "🏒", gradient: "from-cyan-500 via-blue-600 to-indigo-700" },
  { code: "VNL", sport: "volleyball", name: "발리볼 네이션스리그", subtitle: "VNL · 남자 국가대항", flag: "🏐", gradient: "from-amber-500 via-orange-500 to-red-500" },
  { code: "AVC_NATIONS_W", sport: "volleyball", name: "AVC 네이션스컵", subtitle: "배구 여자 · 한국 출전", flag: "🏐", gradient: "from-sky-500 via-blue-500 to-indigo-600" },
  { code: "EGL_W", sport: "volleyball", name: "유럽 발리볼리그", subtitle: "배구 여자 · CEV", flag: "🏐", gradient: "from-violet-500 via-purple-500 to-fuchsia-500" },
  { code: "LOL", sport: "esports", name: "LCK", subtitle: "리그 오브 레전드 · AI 예측", flag: "🎮", gradient: "from-fuchsia-600 via-purple-600 to-indigo-600", href: "/predictions/LOL" },
];

// 리그 카드 한 장 — gradient bar + 이름 + (있으면) 현재 순위 Top3 미리보기.
function LeagueCardItem({ card, top3 }: { card: LeagueCard; top3?: TopThreeEntry[] }) {
  return (
    <Link
      href={card.href ?? `/standings/${card.code}`}
      prefetch={false}
      className="group rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:-translate-y-0.5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm transition-all relative overflow-hidden"
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
        {card.href ? "AI 예측 보기" : "순위표 보기"}
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

// 축구 — 국가별 그룹(컵대회 제외, 현재 순위 있는 리그만). 리그 카드마다 Top3 미리보기.
function SoccerCountrySection({ groups }: { groups: CountryStandingsGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-8 text-center text-sm text-neutral-500">
        진행 중인 축구 리그 순위가 없습니다. 시즌이 시작되면 자동으로 표시됩니다.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.country} className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm sm:text-base font-bold">
            <span>{g.country}</span>
            <span className="text-xs font-normal text-neutral-400">{g.leagues.length}개 리그</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {g.leagues.map((l) => (
              <Link
                key={l.league}
                href={`/standings/${l.league}`}
                prefetch={false}
                className="rounded-xl border border-neutral-200 dark:border-neutral-800 px-4 py-3 hover:-translate-y-0.5 hover:shadow-sm hover:border-neutral-400 dark:hover:border-neutral-600 transition"
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
    fetchSportGroups(),
    fetchSoccerCountryGroups(),
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
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">리그별 순위</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          축구·야구·농구·하키·배구·e스포츠 — 종목별 시즌 순위와 득점왕·도움왕 리더보드를 한눈에.
          각 리그를 클릭해 상세 순위표와 시즌 리더보드를 확인하세요.
        </p>
      </header>

      {/* 종목 칩 앵커 */}
      <nav className="flex flex-wrap gap-2 text-sm">
        {sportsToShow.map((s) => (
          <a
            key={s.code}
            href={`#sport-${s.code}`}
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-4 py-1.5 font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
          >
            {s.emoji} {s.label}
          </a>
        ))}
      </nav>

      {/* 종목별 섹션 */}
      {sportsToShow.map((sport) => {
        const cards = LEAGUES.filter((l) => l.sport === sport.code);
        return (
          <section key={sport.code} id={`sport-${sport.code}`} className="space-y-4 scroll-mt-20">
            <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight border-b border-neutral-200 dark:border-neutral-800 pb-2">
              <span className="text-2xl">{sport.emoji}</span>
              {sport.label}
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
      <section className="mt-4 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          리그별 순위 및 시즌 데이터 분석
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          EPL, 라리가, 분데스리가, 세리에 A, MLB, NBA, KBO 등 주요 리그의 시즌 순위·승점·득실차·홈/원정 분리 성적을 Elo 레이팅 기반 분석과 함께 제공합니다. 각 리그 순위표에서는 득점왕·도움왕 등 시즌 리더보드도 함께 확인할 수 있습니다.
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          실시간 경기 진행은{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            라이브스코어
          </Link>
          에서, 경기 전 매치업 분석은{" "}
          <Link href="/previews" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            프리뷰
          </Link>
          에서, 종료 후 결과는{" "}
          <Link href="/predictions" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            리뷰
          </Link>
          에서 확인할 수 있습니다.{" "}
          <Link href="/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            부상자 명단
          </Link>
          도 함께 참고하세요.
        </p>
      </section>
    </main>
  );
}
