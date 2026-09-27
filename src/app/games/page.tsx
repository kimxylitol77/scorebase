// 게임 허브 — 사이트 안의 게임·놀거리 진입점. 헤더 「커뮤니티 > 게임」이 여기로 온다.
// 게임마다 메뉴 한 줄씩 차지하던 것을 한 곳에 모았다. 새 게임은 GAMES 에 한 항목 추가하면 된다.
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardList, Footprints, Swords, Trophy, Vote, type LucideIcon } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "게임 — 블라인드 드래프트·축구선수 인생·드림팀",
  description:
    "KBO·MLB·EPL·K리그·NBA·KBL 역대 선수로 전승 팀에 도전하는 블라인드 드래프트, 유스부터 은퇴까지 살아보는 축구선수 인생, 나만의 스쿼드로 겨루는 드림팀까지. 실제 선수 데이터로 만든 스포츠 게임을 한 곳에서 — 스코어베이스.",
  keywords: ["역대 선수 드래프트 게임", "KBO 게임", "야구 게임", "축구 게임", "농구 드래프트 게임", "NBA 게임", "축구 커리어 게임", "드림팀", "스포츠 미니게임"],
  alternates: { canonical: `${SITE_URL}/games` },
};

interface GameCard {
  Icon: LucideIcon;
  title: string;
  sub: string;
  href: string;
  cta: string;
  /** 로그인 없이 바로 되는가 */
  free: boolean;
  tag: string;
  links: { label: string; href: string }[];
  accent: string;
}

const GAMES: GameCard[] = [
  {
    Icon: Trophy,
    title: "블라인드 드래프트",
    sub: "이름·시즌·포지션만 보고 역대 선수를 뽑아 팀을 만들고, 한 시즌을 돌려 성적을 냅니다. 목표는 전승 우승입니다.",
    href: "/baseball/draft",
    cta: "드래프트 시작",
    free: true,
    tag: "야구·축구·농구",
    links: [
      { label: "KBO", href: "/baseball/draft" },
      { label: "MLB", href: "/baseball/draft?mode=mlb" },
      { label: "EPL", href: "/soccer/draft" },
      { label: "K리그", href: "/soccer/draft?mode=kleague" },
      { label: "NBA", href: "/basketball/draft" },
      { label: "KBL", href: "/basketball/draft?mode=kbl" },
    ],
    accent: "from-amber-500 to-orange-600",
  },
  {
    Icon: Footprints,
    title: "축구선수 인생 살아보기",
    sub: "16세 유스에서 시작해 이적·부상·대표팀 선택을 거쳐 은퇴까지. 선택 하나로 커리어가 갈립니다.",
    href: "/career",
    cta: "커리어 시작",
    free: true,
    tag: "축구",
    links: [],
    accent: "from-emerald-500 to-teal-600",
  },
  {
    Icon: Swords,
    title: "드림팀 빌더",
    sub: "빅5 현역 선수로 예산 안에서 스쿼드를 짜고, 시즌 리그와 유저 대전으로 구단을 키웁니다.",
    href: "/dream-team",
    cta: "내 팀 만들기",
    free: false,
    tag: "축구",
    links: [
      { label: "자유 구성 (로그인 없이)", href: "/dream-team/free" },
      { label: "순위", href: "/dream-team/leaderboard" },
      { label: "판타지", href: "/dream-team/fantasy" },
    ],
    accent: "from-rose-500 to-pink-600",
  },
];

const MORE: GameCard[] = [
  {
    Icon: ClipboardList,
    title: "라인업 전술판",
    sub: "포메이션에 선수를 배치하고 이미지로 공유합니다.",
    href: "/lineup",
    cta: "전술판 열기",
    free: true,
    tag: "도구",
    links: [
      { label: "축구", href: "/lineup" },
      { label: "농구", href: "/lineup?sport=basketball" },
    ],
    accent: "from-sky-500 to-blue-600",
  },
  {
    Icon: Vote,
    title: "승부예측 투표",
    sub: "오늘 경기의 승패를 찍고 적중률로 순위를 겨룹니다.",
    href: "/picks",
    cta: "투표하러 가기",
    free: true,
    tag: "예측",
    links: [],
    accent: "from-violet-500 to-indigo-600",
  },
];

function Card({ g, big }: { g: GameCard; big?: boolean }) {
  return (
    <section className="group relative flex flex-col rounded-[1.5rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="flex items-center gap-3">
        <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${g.accent} text-white ${big ? "h-12 w-12" : "h-10 w-10"}`} aria-hidden>
          <g.Icon className={big ? "h-6 w-6" : "h-5 w-5"} />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
            <span>{g.tag}</span>
            <span className="text-neutral-300 dark:text-neutral-600">·</span>
            <span className={g.free ? "text-emerald-600 dark:text-emerald-400" : ""}>{g.free ? "회원가입 없이" : "회원 전용"}</span>
          </p>
          <h2 className={`font-bold tracking-tight break-keep text-zinc-950 dark:text-white ${big ? "text-lg" : "text-base"}`}>
            {/* 카드 전체가 눌리도록 제목 링크를 늘린다 — 아래 칩은 z-10 으로 따로 눌린다 */}
            <Link href={g.href} className="after:absolute after:inset-0 after:rounded-[1.5rem]">
              {g.title}
            </Link>
          </h2>
        </div>
      </div>
      <p className="mt-3 flex-1 text-[13px] leading-relaxed break-keep text-neutral-600 dark:text-white/60">{g.sub}</p>

      {g.links.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {g.links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="inline-flex items-center rounded-full border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-rose-400 hover:text-rose-600 dark:border-white/10 dark:text-neutral-300 dark:hover:text-rose-400"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}

      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-rose-600 transition-all duration-300 group-hover:gap-2 dark:text-rose-400">
        {g.cta}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </section>
  );
}

export default function GamesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "스코어베이스 게임",
    itemListElement: [...GAMES, ...MORE].map((g, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: g.title,
      url: `${SITE_URL}${g.href}`,
    })),
  };
  return (
    <main className="relative mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6 sm:py-14">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 게임
        </span>
        <h1 className="text-3xl font-bold tracking-tight break-keep sm:text-4xl">실제 선수 데이터로 노는 게임</h1>
        <p className="text-sm break-keep text-neutral-600 dark:text-neutral-400">
          매일 모으는 경기·선수 기록으로 만든 게임입니다. 대부분 회원가입 없이 바로 시작합니다.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {GAMES.map((g) => (
          <Card key={g.href} g={g} big />
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-white">더 놀거리</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {MORE.map((g) => (
            <Card key={g.href} g={g} />
          ))}
        </div>
      </section>
    </main>
  );
}
