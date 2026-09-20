// 기타 종목 허브 — 하키·배구·e스포츠·테니스·골프·F1·UFC 진입점.
// 축구·야구·농구는 각자 허브(/soccer·/baseball·/basketball)가 있고, 나머지 종목은
// 개별 허브가 없거나(배구·테니스·골프·F1) 메뉴에서 빠져 있어 한 곳에 모은다.
// 각 카드 = 라이브 스코어 + 그 종목의 심화 콘텐츠(순위·일정·선수·랭킹) 링크. 일정은 리그 페이지 일정 탭이 맡는다.

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";

// 정적 카드만 남았다(일정 섹션은 2026-09-18 제거 — 일정은 각 리그 페이지 일정 탭으로). 1시간.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "기타 종목 — 하키·배구·e스포츠·테니스·골프·F1·UFC",
  description:
    "NHL·KHL·유럽 하키, 배구 V-리그 남·여·VNL, LCK e스포츠, 테니스 ATP·WTA, 골프 PGA·LPGA, F1, UFC 까지. 라이브 스코어와 순위·선수 기록·랭킹·한국 선수 성적을 한국어로 한 곳에서 — 스코어베이스.",
  keywords: [
    "하키 라이브스코어", "NHL 순위", "KHL 순위", "배구 라이브스코어", "V리그 순위", "V리그 선수 기록", "VNL",
    "LCK 순위", "테니스 세계랭킹", "ATP 랭킹", "골프 한국 선수", "LPGA",
    "F1 순위", "포뮬러1 챔피언십", "UFC 랭킹", "UFC 대회 일정",
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
    sub: "NHL · KHL · 유럽 리그 · IIHF 세계선수권 — 순위·선수·플레이오프 예측",
    href: "/hockey",
    hrefLabel: "하키 허브",
    // 2026-09-18 KHL·유럽 6개 리그 공식 순위 온보딩 — KHL 은 선수 기록·로스터까지
    links: [
      { label: "라이브 스코어", href: "/scores?sport=hockey" },
      { label: "NHL 순위", href: "/standings/NHL" },
      { label: "KHL 순위·선수 기록", href: "/standings/KHL" },
      { label: "KHL 일정", href: "/leagues/KHL?view=fixtures" },
      { label: "핀란드 리가", href: "/standings/LIIGA" },
      { label: "스위스 NL", href: "/standings/SWISS_NL" },
      { label: "체코", href: "/standings/CZECH_EXTRALIGA" },
      { label: "챔피언스 하키 리그", href: "/standings/CHL_HOCKEY" },
      { label: "연봉 랭킹", href: "/salaries/nhl" },
      { label: "부상자", href: "/injuries/NHL" },
    ],
    accent: "from-sky-500 to-blue-600",
  },
  {
    emoji: "🏐",
    title: "배구",
    sub: "V-리그 남·여(10월 31일 개막) 순위·선수·기록 · VNL 국가대항 — 세트 스코어",
    href: "/leagues/V_LEAGUE",
    hrefLabel: "V-리그 남자부",
    // 2026-09-18 V-리그 리그 페이지 완성(순위·선수 기록·일정·역사, 선수 상세 227명)
    links: [
      { label: "V-리그 여자부", href: "/leagues/V_LEAGUE_W" },
      { label: "남자부 선수 기록", href: "/leagues/V_LEAGUE?view=stats" },
      { label: "여자부 선수 기록", href: "/leagues/V_LEAGUE_W?view=stats" },
      { label: "남자부 선수 명단", href: "/leagues/V_LEAGUE?view=players" },
      { label: "여자부 선수 명단", href: "/leagues/V_LEAGUE_W?view=players" },
      { label: "남자부 일정", href: "/leagues/V_LEAGUE?view=fixtures" },
      { label: "여자부 일정", href: "/leagues/V_LEAGUE_W?view=fixtures" },
      { label: "라이브 스코어", href: "/scores?sport=volleyball" },
      { label: "VNL 순위", href: "/standings/VNL" },
      { label: "VNL 여자 순위", href: "/standings/VNL_W" },
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
      { label: "LCK 일정", href: "/leagues/LOL?view=fixtures" },
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
      { label: "대진표", href: "/tennis/draw" },
      { label: "WTA 랭킹", href: "/rankings/tennis?tour=wta" },
      { label: "연봉 랭킹", href: "/salaries/tennis" },
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
      { label: "상금 랭킹", href: "/salaries/golf" },
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
      { label: "연봉 랭킹", href: "/salaries/f1" },
    ],
    accent: "from-red-600 to-orange-500",
  },
  {
    emoji: "🥊",
    title: "UFC",
    sub: "종합격투기 — 체급별 랭킹·파이터 프로필·이벤트 결과",
    href: "/rankings/ufc",
    hrefLabel: "UFC 랭킹",
    links: [
      { label: "이벤트 일정·결과", href: "/scores?sport=mma" },
      { label: "체급별 랭킹", href: "/rankings/ufc" },
    ],
    accent: "from-zinc-600 to-red-700",
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
          하키 · 배구 · e스포츠 · 테니스 · 골프 · F1 · UFC
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          축구·야구·농구 외 종목의 다가오는 경기 일정과 라이브 스코어·순위·랭킹을 한 곳에서. 선수 이름과 팀명을 한국어로 봅니다.
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
