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
  IdCard,
  Gem,
  Award,
  Coins,
  Activity,
  Globe,
  Flag,
  Radio,
  HeartPulse,
  Newspaper,
  Users,
  Swords,
  Repeat,
  Banknote,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import championsData from "../../../data/league-champions.json";

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
  { code: "K_LEAGUE_1", name: "K리그1", sub: "대한민국" },
];

// 컵 대회 진입로 — 리그와 달리 순위표가 없어 허브에서는 "직전 우승"을 미리보기로 쓴다.
const CHAMPS = championsData as Record<string, { champions: { season: string; ko: string }[] }>;
const lastChampion = (code: string) => CHAMPS[code]?.champions?.[0] ?? null;

const CUP_EUROPE = [
  { code: "FA_CUP", name: "FA컵" },
  { code: "EFL_CUP", name: "카라바오 컵" },
  { code: "COPA_DEL_REY", name: "코파 델 레이" },
  { code: "DFB_POKAL", name: "DFB-포칼" },
  { code: "COPPA_ITALIA", name: "코파 이탈리아" },
  { code: "COUPE_DE_FRANCE", name: "쿠프 드 프랑스" },
  { code: "SCO_LEAGUE_CUP", name: "스코틀랜드 리그컵" },
  { code: "SUI_CUP", name: "스위스컵" },
  { code: "SVENSKA_CUPEN", name: "스벤스카 컵" },
];
const CUP_WORLD = [
  { code: "KFA_CUP", name: "KFA컵" },
  { code: "EMPEROR_CUP", name: "천황배" },
  { code: "LEVAIN_CUP", name: "르베인 컵" },
  { code: "COPA_DO_BRASIL", name: "코파 두 브라질" },
  { code: "CONCACAF_CCUP", name: "CONCACAF 챔피언스컵" },
  { code: "AFC_CUP", name: "AFC컵" },
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
          <span className="text-sm text-neutral-400">빅5 · K리그 · 유럽 대항전 · 월드컵 · 랭킹</span>
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
            links={[
              { label: "순위", href: `/leagues/${lg.code}` },
              { label: "파워랭킹", href: `/leagues/${lg.code}?view=power` },
              { label: "AI 예측", href: `/predictions/${lg.code}` },
              { label: "역사", href: `/leagues/${lg.code}?view=history` },
              { label: "글·분석", href: `/leagues/${lg.code}?view=articles` },
              { label: "부상자", href: `/injuries/${lg.code}` },
            ]}
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

        {/* 유럽 대항전 — UCL·UEL·UECL */}
        <Card
          title="유럽 대항전"
          Icon={Trophy}
          badge="UCL · UEL · UECL"
          href="/leagues/UCL"
          hrefLabel="챔피언스리그"
          links={[
            { label: "UCL 대진·예측", href: "/predictions/UCL" },
            { label: "유로파리그", href: "/leagues/UEL" },
            { label: "컨퍼런스리그", href: "/leagues/UECL" },
            { label: "UCL 역사", href: "/leagues/UCL?view=history" },
            { label: "글·분석", href: "/leagues/UCL?view=articles" },
          ]}
        >
          <p className="text-sm text-neutral-500 break-keep">
            챔피언스리그·유로파리그·컨퍼런스리그 · 대진·일정·AI 예측.
          </p>
        </Card>

        {/* 유럽 국내 컵 — 녹아웃이라 순위가 없다. 미리보기는 직전 우승 */}
        <Card
          title="유럽 국내 컵"
          Icon={Trophy}
          badge="FA컵 · 코파 · 포칼"
          href="/leagues/FA_CUP"
          hrefLabel="FA컵 일정·역사"
          links={CUP_EUROPE.map((c) => ({ label: c.name, href: `/leagues/${c.code}` }))}
        >
          <ChampionPreview codes={["FA_CUP", "COPA_DEL_REY", "DFB_POKAL"]} />
        </Card>

        {/* 아시아·아메리카 컵 */}
        <Card
          title="아시아 · 아메리카 컵"
          Icon={Trophy}
          badge="KFA · 천황배 · 코파"
          href="/leagues/KFA_CUP"
          hrefLabel="KFA컵 일정·역사"
          links={CUP_WORLD.map((c) => ({ label: c.name, href: `/leagues/${c.code}` }))}
        >
          <ChampionPreview codes={["KFA_CUP", "EMPEROR_CUP", "COPA_DO_BRASIL"]} />
        </Card>

        {/* 축구 랭킹 모음 — FIFA 남녀·클럽·가성비·발롱도르 */}
        <Card
          title="축구 랭킹"
          Icon={Globe}
          badge="국가 · 클럽"
          href="/predictions/fifa-ranking"
          hrefLabel="FIFA 국가 랭킹"
          links={[
            { label: "FIFA 랭킹 (남)", href: "/predictions/fifa-ranking" },
            { label: "FIFA 랭킹 (여)", href: "/predictions/fifa-ranking-women" },
            { label: "세계 클럽 랭킹", href: "/predictions/club-ranking" },
            { label: "가성비 구단", href: "/rankings/value-clubs" },
            { label: "발롱도르 지수", href: "/ballon" },
          ]}
        >
          <p className="text-sm text-neutral-500 break-keep">
            FIFA 국가 랭킹(남·여)·세계 클럽 랭킹 — 매일 자동 갱신.
          </p>
        </Card>

        {/* 한국 축구 — 해외파·K리그 */}
        <Card
          title="한국 축구"
          Icon={Flag}
          badge="해외파 · K리그"
          href="/soccer/korea"
          hrefLabel="해외파 한국 선수"
          links={[
            { label: "해외파 기록실", href: "/soccer/korea" },
            { label: "K리그1", href: "/leagues/K_LEAGUE_1" },
            { label: "K리그2", href: "/leagues/K_LEAGUE_2" },
            { label: "K리그 카드 데이터", href: "/k-league-cards" },
          ]}
        >
          <p className="text-sm text-neutral-500 break-keep">
            해외파 한국 선수 시즌 기록 · K리그1·2 순위·예측.
          </p>
        </Card>

        {/* 월드컵 */}
        <Card title="FIFA 월드컵 2026" Icon={Trophy} href="/world-cup" hrefLabel="월드컵 허브">
          <p className="text-sm text-neutral-500 break-keep">
            북중미 2026 · 조별리그·우승 확률·베스트11.
          </p>
        </Card>
      </div>

      {/* 기능 바로가기 — 축구 관련 전체 진입로 */}
      <div className="flex flex-wrap gap-2 pt-1">
        <FnChip href="/scores?sport=soccer" Icon={Radio} label="라이브 스코어" />
        <FnChip href="/soccer/sub-impact" Icon={Repeat} label="교체 임팩트" />
        <FnChip href="/standings" Icon={ListOrdered} label="전체 순위표" />
        <FnChip href="/previews" Icon={Newspaper} label="AI 매치 프리뷰" />
        <FnChip href="/transfers" Icon={ArrowLeftRight} label="이적시장 · 몸값 랭킹" />
        <FnChip href="/injuries" Icon={HeartPulse} label="부상자 명단" />
        <FnChip href="/salaries/soccer" Icon={Banknote} label="축구 연봉 랭킹" />
        <FnChip href="/rankings/value-clubs" Icon={Gem} label="가성비 구단 랭킹" />
        <FnChip href="/compare?sport=SOCCER" Icon={GitCompare} label="선수 비교" />
        <FnChip href="/ballon" Icon={Award} label="발롱도르 순위 지수" />
        <FnChip href="/predictions" Icon={Target} label="시즌 예측" />
        <FnChip href="/picks" Icon={Swords} label="승부예측 투표" />
        <FnChip href="/value-bets" Icon={Coins} label="밸류 베트" />
        <FnChip href="/odds?sport=soccer" Icon={Activity} label="배당 흐름" />
        <FnChip href="/dream-team" Icon={Users} label="드림팀 게임" />
        <FnChip href="/lineup" Icon={ClipboardList} label="라인업 전술판" />
        <FnChip href="/k-league-cards" Icon={IdCard} label="K리그 카드 선수 데이터" />
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
  links,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  badge?: string;
  href: string;
  hrefLabel: string;
  links?: { label: string; href: string }[];
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
      {links && links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center rounded-full border border-neutral-200 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-400"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
      >
        {hrefLabel} →
      </Link>
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

// 컵 카드 미리보기 — 순위표 자리에 직전 우승팀을 넣는다(기록 없으면 그 줄만 빠짐).
function ChampionPreview({ codes }: { codes: string[] }) {
  const rows = codes
    .map((code) => ({ code, name: LEAGUE_KO[code] ?? code, champ: lastChampion(code) }))
    .filter((r) => r.champ);
  if (rows.length === 0) return <Empty>역대 우승 기록을 수집 중입니다.</Empty>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.code} className="flex items-center justify-between text-sm gap-2">
          <span className="text-neutral-500 shrink-0">{r.name}</span>
          <span className="truncate">
            <span className="text-neutral-400 text-xs tabular-nums mr-1.5">{r.champ!.season}</span>
            {r.champ!.ko}
          </span>
        </li>
      ))}
    </ul>
  );
}

const LEAGUE_KO: Record<string, string> = Object.fromEntries(
  [...CUP_EUROPE, ...CUP_WORLD].map((c) => [c.code, c.name]),
);

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 py-2">{children}</p>;
}
