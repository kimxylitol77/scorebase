// /predictions 인덱스 — 리그 카드 grid. 각 리그 클릭 시 /predictions/{LEAGUE}.
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "시즌 예측 — 스코어베이스",
  description:
    "19개 리그 시즌 시뮬레이션 — Monte Carlo 1,000회 기반 우승·플레이오프·강등 확률. K리그1·K리그2·J1·J2·AFC 챔스 엘리트·KBO·NPB·MLB·EPL·LCK 등.",
};

interface LeagueCard {
  code: string;
  name: string;
  subtitle: string;
  flag: string;
  gradient: string;
}

// 한국 시청자 우선 정렬 — 한국·아시아 → 유럽 → 북미.
const LEAGUES: LeagueCard[] = [
  { code: "K_LEAGUE_1", name: "K리그1", subtitle: "한국 1부", flag: "🇰🇷", gradient: "from-red-600 via-blue-600 to-slate-900" },
  { code: "K_LEAGUE_2", name: "K리그2", subtitle: "한국 2부", flag: "🇰🇷", gradient: "from-slate-600 via-blue-700 to-red-600" },
  { code: "KBO", name: "KBO 리그", subtitle: "한국 프로야구", flag: "🇰🇷", gradient: "from-blue-600 via-indigo-600 to-rose-500" },
  { code: "J1_LEAGUE", name: "J1리그", subtitle: "일본 1부", flag: "🇯🇵", gradient: "from-red-600 via-rose-500 to-pink-500" },
  { code: "J2_LEAGUE", name: "J2리그", subtitle: "일본 2부", flag: "🇯🇵", gradient: "from-pink-500 via-rose-400 to-amber-400" },
  { code: "NPB", name: "NPB 리그", subtitle: "일본 프로야구", flag: "🇯🇵", gradient: "from-red-600 via-rose-500 to-pink-500" },
  { code: "AFC_CL", name: "AFC 챔스 엘리트", subtitle: "아시아 최상위 클럽", flag: "🌏", gradient: "from-emerald-600 via-teal-600 to-cyan-500" },
  { code: "LOL", name: "LCK", subtitle: "리그 오브 레전드 한국", flag: "🎮", gradient: "from-rose-500 via-fuchsia-600 to-indigo-600" },
  { code: "EPL", name: "프리미어리그", subtitle: "EPL · 잉글랜드", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", gradient: "from-purple-600 via-fuchsia-500 to-pink-500" },
  { code: "LALIGA", name: "라리가", subtitle: "스페인", flag: "🇪🇸", gradient: "from-red-600 via-amber-500 to-yellow-500" },
  { code: "BUNDESLIGA", name: "분데스리가", subtitle: "독일", flag: "🇩🇪", gradient: "from-yellow-500 via-red-600 to-black" },
  { code: "SERIE_A", name: "세리에 A", subtitle: "이탈리아", flag: "🇮🇹", gradient: "from-green-600 via-white to-red-600" },
  { code: "LIGUE_1", name: "리그 1", subtitle: "프랑스", flag: "🇫🇷", gradient: "from-blue-700 via-rose-600 to-indigo-600" },
  { code: "UCL", name: "챔피언스리그", subtitle: "유럽", flag: "🏆", gradient: "from-indigo-700 via-blue-600 to-cyan-500" },
  { code: "MLS", name: "MLS", subtitle: "북미 축구", flag: "🇺🇸", gradient: "from-red-600 via-slate-900 to-blue-700" },
  { code: "WORLD_CUP", name: "FIFA 월드컵 2026", subtitle: "미국·캐나다·멕시코", flag: "🌎", gradient: "from-amber-500 via-rose-500 to-fuchsia-600" },
  { code: "NBA", name: "NBA", subtitle: "미국 농구", flag: "🏀", gradient: "from-orange-500 via-amber-500 to-yellow-500" },
  { code: "MLB", name: "MLB", subtitle: "메이저리그", flag: "⚾", gradient: "from-emerald-500 via-green-600 to-teal-700" },
  { code: "NHL", name: "NHL", subtitle: "북미 아이스하키", flag: "🏒", gradient: "from-cyan-500 via-blue-600 to-indigo-700" },
];

export default function PredictionsRoot() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight">시즌 예측</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          Elo 레이팅 + Monte Carlo 1,000회 시뮬레이션으로 산출한 시즌 종료 시 우승·플레이오프·강등 확률.
          각 리그 카드를 클릭하면 상세 분포·잔여 일정·팀별 확률 표를 볼 수 있습니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/predictions/accuracy" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition">
            🎯 AI 적중률 보드
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEAGUES.map((lg) => (
          <Link
            key={lg.code}
            href={`/predictions/${lg.code}`}
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
              시즌 예측 보기
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-neutral-200 dark:border-neutral-800 space-y-3">
        <h2 className="text-base sm:text-lg font-bold tracking-tight">
          경기 결과 리뷰 및 시즌 데이터 분석
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          EPL, MLB, NBA, KBO 등 주요 리그의 시즌 우승·플레이오프·강등 확률을 Elo 레이팅과 Monte Carlo 시뮬레이션으로 분석해 제공합니다. 경기 종료 후 결과 리뷰와 적중률 보드도 함께 확인할 수 있습니다.
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
          에서 확인할 수 있습니다. 함께{" "}
          <Link href="/injuries" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            부상자 명단
          </Link>
          과{" "}
          <Link href="/standings" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
            리그별 분석
          </Link>
          도 참고하세요.
        </p>
      </section>
    </main>
  );
}
