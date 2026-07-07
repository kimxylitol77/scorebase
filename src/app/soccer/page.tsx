// 축구 종목 허브 — 빅5 리그 선택(순위 Top3 미리보기) + UCL·월드컵·이적·비교 입구.
// 기존 데이터/페이지 재사용(중복 구현 X). 각 리그 카드는 /leagues/{code} 상세로 연결되는 "입구".

import type { Metadata } from "next";
import Link from "next/link";
import { safeFetchTop3 } from "@/lib/sports/standings-overview";
import {
  Trophy,
  ArrowLeftRight,
  GitCompare,
  Target,
  ListOrdered,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "축구 — 빅5 리그·순위·AI 예측·이적시장 한눈에",
  description:
    "프리미어리그·라리가·분데스리가·세리에A·리그1 빅5와 챔피언스리그·월드컵의 순위·일정·AI 예측·이적시장을 한 페이지에서. 스코어베이스 축구 허브.",
  alternates: { canonical: "https://www.scorebase.kr/soccer" },
};

const LEAGUES = [
  { code: "EPL", name: "프리미어리그", sub: "잉글랜드" },
  { code: "LALIGA", name: "라리가", sub: "스페인" },
  { code: "BUNDESLIGA", name: "분데스리가", sub: "독일" },
  { code: "SERIE_A", name: "세리에 A", sub: "이탈리아" },
  { code: "LIGUE_1", name: "리그 1", sub: "프랑스" },
];

export default async function SoccerHub() {
  const top3s = await Promise.all(
    LEAGUES.map((l) => safeFetchTop3(l.code).catch(() => [])),
  );

  const tabs = [
    { label: "리그", href: "/soccer", active: true },
    { label: "순위", href: "/standings", active: false },
    { label: "예측", href: "/predictions", active: false },
    { label: "이적시장", href: "/transfers", active: false },
  ];

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 축구 허브
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-8 h-8 shrink-0"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7.5l2.7 2-1 3.2h-3.4l-1-3.2z" />
              <path d="M12 7.5V4M14.7 9.5l3.1-1.1M13.7 12.7l1.9 2.7M10.3 12.7l-1.9 2.7M9.3 9.5l-3.1-1.1" />
            </svg>
            축구
          </h1>
          <span className="text-sm text-neutral-400">빅5 · UCL · 월드컵</span>
        </div>
        <p className="text-sm text-neutral-500 break-keep">
          리그를 선택해 순위·일정·AI 예측을 확인하세요. 이적시장·선수 비교도 한 곳에서.
        </p>
        <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                t.active
                  ? "border-rose-500 text-rose-600 dark:text-rose-400"
                  : "border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {LEAGUES.map((lg, i) => (
          <Card
            key={lg.code}
            title={lg.name}
            Icon={ListOrdered}
            badge={lg.sub}
            href={`/leagues/${lg.code}`}
            hrefLabel="리그 상세"
            secondaryHref={`/leagues/${lg.code}?view=power`}
            secondaryLabel="AI 파워랭킹"
          >
            {top3s[i].length === 0 ? (
              <Empty>시즌 순위가 아직 없습니다.</Empty>
            ) : (
              <ul className="space-y-1.5">
                {top3s[i].map((t) => (
                  <li key={t.teamId} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="inline-block w-5 text-neutral-400 font-bold tabular-nums">
                        {t.position}
                      </span>
                      {t.name}
                    </span>
                    <span className="text-neutral-500 tabular-nums text-xs">{t.points}점</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}

        {/* 챔피언스리그 */}
        <Card title="챔피언스리그" Icon={Trophy} href="/leagues/UCL" hrefLabel="UCL 상세">
          <p className="text-sm text-neutral-500 break-keep">
            유럽 최강 클럽 토너먼트 · 대진·일정·AI 예측.
          </p>
        </Card>

        {/* 월드컵 */}
        <Card title="FIFA 월드컵 2026" Icon={Trophy} href="/world-cup" hrefLabel="월드컵 허브">
          <p className="text-sm text-neutral-500 break-keep">
            북중미 2026 · 조별리그·우승 확률·베스트11.
          </p>
        </Card>
      </div>

      {/* 기능 바로가기 */}
      <div className="flex flex-wrap gap-2 pt-1">
        <FnChip href="/transfers" Icon={ArrowLeftRight} label="이적시장 · 몸값 랭킹" />
        <FnChip href="/compare" Icon={GitCompare} label="선수 비교" />
        <FnChip href="/predictions" Icon={Target} label="시즌 예측" />
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        순위는 5분마다 갱신됩니다. 각 리그 카드에서 일정·통계·역사·AI 예측 글까지 볼 수 있습니다. 데이터 출처 api-football·TheSports.
      </footer>
    </main>
  );
}

function Card({
  title,
  Icon,
  badge,
  href,
  hrefLabel,
  secondaryHref,
  secondaryLabel,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  badge?: string;
  href: string;
  hrefLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="group flex flex-col rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold flex items-center gap-1.5 text-zinc-950 dark:text-white">
          <Icon className="w-4 h-4 text-zinc-700 dark:text-white/70" aria-hidden />
          {title}
        </span>
        {badge && <span className="text-[11px] text-zinc-500 dark:text-white/45">{badge}</span>}
      </div>
      <div className="flex-1">{children}</div>
      <div className="mt-3 flex items-center gap-4">
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
        >
          {hrefLabel} →
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link
            href={secondaryHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:opacity-80 dark:text-rose-400"
          >
            <TrendingUp className="w-3 h-3" aria-hidden />
            {secondaryLabel} →
          </Link>
        )}
      </div>
    </section>
  );
}

function FnChip({ href, Icon, label }: { href: string; Icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 px-3.5 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-neutral-50 dark:hover:bg-white/[0.06]"
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 py-2">{children}</p>;
}
