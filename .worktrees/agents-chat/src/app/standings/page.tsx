// /standings 인덱스 — 주요 리그 카드 grid + SEO 콘텐츠.
// [league] 동적 페이지로 이동하는 진입점.

import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: {
    absolute: "리그별 순위 및 시즌 분석 - 스코어베이스",
  },
  description:
    "EPL, 라리가, 분데스리가, 세리에 A, MLB, NBA, KBO 등 주요 리그 시즌 순위와 Elo 레이팅·최근 폼·홈/원정 강도를 데이터 기반으로 정리.",
  alternates: { canonical: "https://www.scorebase.kr/standings" },
};

interface LeagueCard {
  code: string;
  name: string;
  subtitle: string;
  flag: string;
  gradient: string;
}

const LEAGUES: LeagueCard[] = [
  { code: "EPL", name: "프리미어리그", subtitle: "EPL · 잉글랜드", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", gradient: "from-purple-600 via-fuchsia-500 to-pink-500" },
  { code: "LALIGA", name: "라리가", subtitle: "스페인", flag: "🇪🇸", gradient: "from-red-600 via-amber-500 to-yellow-500" },
  { code: "BUNDESLIGA", name: "분데스리가", subtitle: "독일", flag: "🇩🇪", gradient: "from-yellow-500 via-red-600 to-black" },
  { code: "SERIE_A", name: "세리에 A", subtitle: "이탈리아", flag: "🇮🇹", gradient: "from-green-600 via-white to-red-600" },
  { code: "LIGUE_1", name: "리그 1", subtitle: "프랑스", flag: "🇫🇷", gradient: "from-blue-700 via-rose-600 to-indigo-600" },
  { code: "MLS", name: "MLS", subtitle: "북미", flag: "🇺🇸", gradient: "from-red-600 via-slate-900 to-blue-700" },
  { code: "K_LEAGUE_1", name: "K리그 1", subtitle: "한국 1부", flag: "🇰🇷", gradient: "from-red-500 via-rose-500 to-blue-600" },
  { code: "J1_LEAGUE", name: "J1 리그", subtitle: "일본 1부", flag: "🇯🇵", gradient: "from-red-600 via-rose-500 to-pink-500" },
  { code: "NBA", name: "NBA", subtitle: "미국 농구", flag: "🏀", gradient: "from-orange-500 via-amber-500 to-yellow-500" },
  { code: "MLB", name: "MLB", subtitle: "메이저리그", flag: "⚾", gradient: "from-emerald-500 via-green-600 to-teal-700" },
  { code: "KBO", name: "KBO 리그", subtitle: "한국 프로야구", flag: "🇰🇷", gradient: "from-blue-600 via-indigo-600 to-rose-500" },
  { code: "NPB", name: "NPB 리그", subtitle: "일본 프로야구", flag: "🇯🇵", gradient: "from-red-600 via-pink-500 to-rose-500" },
  { code: "NHL", name: "NHL", subtitle: "북미 아이스하키", flag: "🏒", gradient: "from-cyan-500 via-blue-600 to-indigo-700" },
];

export default function StandingsRoot() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">리그별 순위</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          주요 축구·야구·농구·하키 리그의 시즌 순위와 Elo 레이팅·최근 폼·홈/원정 강도를 한눈에.
          각 리그 카드를 클릭해 상세 순위표를 확인하세요.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEAGUES.map((lg) => (
          <Link
            key={lg.code}
            href={`/standings/${lg.code}`}
            className="group rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:-translate-y-0.5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-sm transition-all relative overflow-hidden"
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${lg.gradient}`} />
            <div className="flex items-baseline gap-2">
              <span className="text-2xl">{lg.flag}</span>
              <h3 className="text-lg font-bold tracking-tight group-hover:underline underline-offset-4 decoration-2">
                {lg.name}
              </h3>
            </div>
            <div className="mt-1 text-xs text-neutral-500">{lg.subtitle}</div>
            <div className="mt-4 text-xs font-medium text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition flex items-center gap-1">
              순위표 보기
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-4 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          리그별 순위 및 시즌 데이터 분석
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          EPL, 라리가, 분데스리가, 세리에 A, MLB, NBA, KBO 등 주요 리그의 시즌 순위·승점·득실차·홈/원정 분리 성적을 Elo 레이팅 기반 분석과 함께 제공합니다. 최근 5경기 폼과 잔여 일정 난이도도 한눈에 확인할 수 있습니다.
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
