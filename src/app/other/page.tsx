// 기타 종목 허브 — 하키·배구·e스포츠·테니스·골프·F1 진입점.
// 축구·야구·농구는 각자 허브(/soccer·/baseball·/basketball)가 있고, 나머지 종목은
// 개별 허브가 없거나(배구·테니스·골프·F1) 메뉴에서 빠져 있어 한 곳에 모은다.
// 각 카드 = 라이브 스코어 + 그 종목의 심화 콘텐츠(순위·랭킹·트래커) 링크.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "기타 종목 — 하키·배구·e스포츠·테니스·골프·F1",
  description:
    "NHL 하키, 배구(VNL), LCK e스포츠, 테니스 ATP·WTA, 골프 PGA·LPGA, F1 포뮬러 1까지. 라이브 스코어와 순위·랭킹·한국 선수 성적을 한국어로 한 곳에서 — 스코어베이스.",
  keywords: [
    "하키 라이브스코어", "NHL 순위", "배구 라이브스코어", "VNL",
    "LCK 순위", "테니스 세계랭킹", "ATP 랭킹", "골프 한국 선수", "LPGA",
    "F1 순위", "포뮬러1 챔피언십",
  ],
  alternates: { canonical: `${SITE_URL}/other` },
};

interface SportCard {
  emoji: string;
  title: string;
  sub: string;
  /** 대표 진입 링크 */
  href: string;
  hrefLabel: string;
  /** 부가 링크 — 심화 콘텐츠 */
  links: { label: string; href: string }[];
  accent: string;
}

const SPORTS: SportCard[] = [
  {
    emoji: "🏒",
    title: "하키",
    sub: "NHL · IIHF 세계선수권 — 순위·선수·플레이오프 예측",
    href: "/hockey",
    hrefLabel: "하키 허브",
    links: [
      { label: "라이브 스코어", href: "/scores?sport=hockey" },
      { label: "NHL 순위", href: "/standings/NHL" },
      { label: "연봉 랭킹", href: "/salaries/nhl" },
      { label: "부상자", href: "/injuries/NHL" },
    ],
    accent: "from-sky-500 to-blue-600",
  },
  {
    emoji: "🏐",
    title: "배구",
    sub: "VNL 발리볼 네이션스리그 · 국가대항 — 세트 스코어",
    href: "/scores?sport=volleyball",
    hrefLabel: "배구 라이브 스코어",
    links: [
      { label: "VNL 순위", href: "/standings/VNL" },
      { label: "전체 순위표", href: "/standings" },
    ],
    accent: "from-amber-500 to-orange-600",
  },
  {
    emoji: "🎮",
    title: "e스포츠",
    sub: "LCK 리그 오브 레전드 · 국제 대회 — 세트 스코어·순위",
    href: "/scores?sport=esports",
    hrefLabel: "e스포츠 라이브 스코어",
    links: [
      { label: "LCK 순위·선수", href: "/standings/LOL" },
      { label: "전체 순위표", href: "/standings" },
    ],
    accent: "from-fuchsia-600 to-indigo-600",
  },
  {
    emoji: "🎾",
    title: "테니스",
    sub: "ATP·WTA 투어 — 세계랭킹 150위·선수 프로필",
    href: "/rankings/tennis",
    hrefLabel: "테니스 세계랭킹",
    links: [
      { label: "라이브 스코어", href: "/scores?sport=tennis" },
      { label: "WTA 랭킹", href: "/rankings/tennis?tour=wta" },
    ],
    accent: "from-emerald-500 to-teal-600",
  },
  {
    emoji: "⛳",
    title: "골프",
    sub: "PGA·LPGA — 리더보드·한국 선수 시즌 성적",
    href: "/golf/korea",
    hrefLabel: "한국 선수 시즌 성적",
    links: [
      { label: "라이브 리더보드", href: "/scores?sport=golf" },
      { label: "PGA 한국 선수", href: "/golf/korea?tour=pga" },
    ],
    accent: "from-lime-500 to-green-600",
  },
  {
    emoji: "🏎️",
    title: "F1",
    sub: "포뮬러 1 — 드라이버·컨스트럭터 챔피언십",
    href: "/rankings/f1",
    hrefLabel: "F1 챔피언십 순위",
    links: [
      { label: "그랑프리 일정", href: "/scores?sport=f1" },
      { label: "컨스트럭터 순위", href: "/rankings/f1?view=team" },
    ],
    accent: "from-red-600 to-orange-500",
  },
];

export default function OtherSportsPage() {
  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 기타 종목
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          하키 · 배구 · e스포츠 · 테니스 · 골프 · F1
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          축구·야구·농구 외 종목의 라이브 스코어와 순위·랭킹을 한 곳에서. 선수 이름과 팀명을 한국어로 봅니다.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SPORTS.map((s) => (
          <section
            key={s.title}
            className="group flex flex-col rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${s.accent} text-lg`} aria-hidden>
                {s.emoji}
              </span>
              <h2 className="text-base font-bold tracking-tight text-zinc-950 dark:text-white">{s.title}</h2>
            </div>
            <p className="flex-1 text-[13px] leading-relaxed text-neutral-600 dark:text-white/60 break-keep">
              {s.sub}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="inline-flex items-center rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-rose-400 hover:text-rose-600 dark:border-white/10 dark:text-neutral-300 dark:hover:text-rose-400"
                >
                  {l.label}
                </Link>
              ))}
            </div>

            <Link
              href={s.href}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
            >
              {s.hrefLabel} →
            </Link>
          </section>
        ))}
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        축구·야구·농구는 각 종목 허브에서 확인하세요. 테니스·골프·F1 데이터 출처 ESPN,
        하키·배구·e스포츠는 TheSports·공식 API 기반입니다.
      </footer>
    </main>
  );
}
