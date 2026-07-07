// 야구 종목 허브 — 오늘 경기·KBO 순위·AI 예측·선발·연봉·주목 선수를 한 페이지에.
// 기존 데이터/페이지 재사용(중복 구현 X), 각 카드는 상세 페이지로 연결되는 "입구".
// ⚠️ /scores 페이지는 미수정 — prisma.match 만 직접 읽음.

import type { Metadata } from "next";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { safeFetchTop3 } from "@/lib/sports/standings-overview";
import { Clock, ListOrdered, Target, Swords, Coins, Star, Radar, type LucideIcon } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "야구 — 오늘 경기·순위·AI 예측·연봉 한눈에",
  description:
    "KBO·MLB·NPB 오늘 경기, 리그 순위, AI 승부 예측, 선발 매치업, 연봉 랭킹, 주목 선수를 한 페이지에서. 스코어베이스 야구 허브.",
  alternates: { canonical: "https://www.scorebase.kr/baseball" },
};

const BASEBALL = ["KBO", "MLB", "NPB"];

interface StarterJson {
  name?: string;
  era?: number;
  whip?: number;
}
function parseStarter(raw: unknown): StarterJson | null {
  if (!raw) return null;
  try {
    const o = typeof raw === "string" ? JSON.parse(raw) : raw;
    return o && typeof o === "object" ? (o as StarterJson) : null;
  } catch {
    return null;
  }
}

function fmtManwon(manwon: number): string {
  const eok = Math.floor(manwon / 10000);
  const rem = manwon % 10000;
  if (eok > 0 && rem > 0) return `${eok}억 ${rem.toLocaleString()}만원`;
  if (eok > 0) return `${eok}억원`;
  return `${manwon.toLocaleString()}만원`;
}

const pad = (n: number) => String(n).padStart(2, "0");

const STARS = [
  { name: "양의지", sub: "KBO · 두산 포수", href: "/players/76232?league=KBO" },
  { name: "후안 소토", sub: "MLB · 메츠 외야수", href: "/players/665742" },
  { name: "도고 쇼세이", sub: "NPB · 요미우리 투수", href: "/players/41045138?league=NPB" },
];

export default async function BaseballHub() {
  // KST 오늘 0시~24시 → UTC 범위
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const midnightUtcMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600_000;
  const startUtc = new Date(midnightUtcMs);
  const endUtc = new Date(midnightUtcMs + 24 * 3600_000);

  const [games, kboTop3, mlbTop3, npbTop3, spMatches, salaries] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: { in: BASEBALL },
        startTime: { gte: startUtc, lte: endUtc },
        status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
      },
      select: {
        id: true,
        externalId: true,
        league: true,
        startTime: true,
        status: true,
        homeScore: true,
        awayScore: true,
        predHome: true,
        predAway: true,
        homeStarter: true,
        awayStarter: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    safeFetchTop3("KBO").catch(() => []),
    safeFetchTop3("MLB").catch(() => []),
    safeFetchTop3("NPB").catch(() => []),
    prisma.match.findMany({
      where: { league: { in: BASEBALL }, predCorrect: { not: null } },
      select: { predCorrect: true, predHome: true, predAway: true, league: true },
    }),
    prisma.playerSalary.findMany({
      where: { league: "KBO" },
      orderBy: { rank: "asc" },
      take: 3,
    }),
  ]);

  // 야구 Strong Pick(리그별 임계) 적중률
  let hit = 0;
  let total = 0;
  for (const m of spMatches) {
    const top = Math.max(m.predHome ?? 0, m.predAway ?? 0);
    if (top < strongPickThreshold(m.league)) continue;
    total++;
    if (m.predCorrect) hit++;
  }
  const spRate = total >= 20 ? Math.round((hit / total) * 100) : null;

  // 오늘 매치 중 가장 자신 있는 예측
  const topPick = games
    .map((g) => {
      const ph = g.predHome ?? 0;
      const pa = g.predAway ?? 0;
      const top = Math.max(ph, pa);
      return { g, top, homeWin: ph >= pa };
    })
    .filter((x) => x.top >= 0.6)
    .sort((a, b) => b.top - a.top)[0];

  // 선발 양쪽 다 있는 첫 매치
  const starterGame = games.find(
    (g) => parseStarter(g.homeStarter) && parseStarter(g.awayStarter),
  );

  const tabs = [
    { label: "야구 홈", href: "/baseball", active: true },
    { label: "라이브 스코어", href: "/scores", active: false },
    { label: "AI 적중률", href: "/predictions/accuracy", active: false },
    { label: "선수 비교", href: "/compare", active: false },
  ];

  // 리그별 블록 — 순위 Top3 + 순위·예측·글·부상 등 모든 진입로
  const LEAGUE_BLOCKS: {
    code: string;
    name: string;
    top3: typeof kboTop3;
    links: { label: string; href: string }[];
  }[] = [
    {
      code: "KBO",
      name: "KBO 리그",
      top3: kboTop3,
      links: [
        { label: "순위", href: "/standings/KBO" },
        { label: "AI 예측", href: "/predictions/KBO" },
        { label: "글·분석", href: "/leagues/KBO" },
        { label: "역사", href: "/leagues/KBO?view=history" },
        { label: "부상자", href: "/injuries/KBO" },
        { label: "연봉", href: "/salaries/kbo" },
      ],
    },
    {
      code: "MLB",
      name: "MLB",
      top3: mlbTop3,
      links: [
        { label: "순위", href: "/standings/MLB" },
        { label: "AI 예측", href: "/predictions/MLB" },
        { label: "글·분석", href: "/leagues/MLB" },
        { label: "역사", href: "/leagues/MLB?view=history" },
        { label: "부상자", href: "/injuries/MLB" },
        { label: "Statcast", href: "/baseball/statcast" },
        { label: "연봉", href: "/salaries/mlb" },
      ],
    },
    {
      code: "NPB",
      name: "NPB",
      top3: npbTop3,
      links: [
        { label: "순위", href: "/standings/NPB" },
        { label: "AI 예측", href: "/predictions/NPB" },
        { label: "글·분석", href: "/leagues/NPB" },
        { label: "역사", href: "/leagues/NPB?view=history" },
        { label: "부상자", href: "/injuries/NPB" },
      ],
    },
  ];

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 야구 허브
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-8 h-8 shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M7.5 3.8a9 9 0 0 1 0 16.4" />
              <path d="M16.5 3.8a9 9 0 0 0 0 16.4" />
            </svg>
            야구
          </h1>
          <span className="text-sm text-neutral-400">KBO · MLB · NPB</span>
        </div>
        <p className="text-sm text-neutral-500 break-keep">
          오늘 경기부터 순위·AI 예측·선발·연봉·주목 선수까지 한 페이지에서.
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

      {/* 리그별 — 순위·예측·글·분석·부상 모든 진입로 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">리그별</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LEAGUE_BLOCKS.map((lg) => (
            <LeagueBlock key={lg.code} name={lg.name} top3={lg.top3} links={lg.links} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 오늘 경기 */}
        <Card title="오늘 경기" Icon={Clock} badge={`${games.length}경기`} href="/scores" hrefLabel="전체 경기">
          {games.length === 0 ? (
            <Empty>오늘 예정된 야구 경기가 없습니다.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {games.slice(0, 5).map((g) => {
                const home = toKoreanTeamName(g.homeTeam.name, g.league) || g.homeTeam.name;
                const away = toKoreanTeamName(g.awayTeam.name, g.league) || g.awayTeam.name;
                const kst = new Date(g.startTime.getTime() + 9 * 3600_000);
                const tag =
                  g.status === "FINISHED" ? "종료" : g.status === "LIVE" ? "LIVE" : `${kst.getUTCHours()}:${pad(kst.getUTCMinutes())}`;
                const scored = g.homeScore != null && g.awayScore != null;
                return (
                  <li key={g.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">
                      {home}{" "}
                      <span className="tabular-nums font-semibold">
                        {scored ? `${g.homeScore} - ${g.awayScore}` : "vs"}
                      </span>{" "}
                      {away}
                    </span>
                    <span
                      className={`shrink-0 ml-2 text-[11px] tabular-nums ${
                        g.status === "LIVE" ? "text-red-500 font-bold" : "text-neutral-400"
                      }`}
                    >
                      {g.league} · {tag}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* AI 예측 */}
        <Card
          title="AI 예측"
          Icon={Target}
          badge={spRate != null ? `Strong ${spRate}%` : undefined}
          href="/predictions/accuracy"
          hrefLabel="적중률 보드"
        >
          {topPick ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="truncate">
                  {toKoreanTeamName(topPick.g.homeTeam.name, topPick.g.league) || topPick.g.homeTeam.name}
                  {" vs "}
                  {toKoreanTeamName(topPick.g.awayTeam.name, topPick.g.league) || topPick.g.awayTeam.name}
                </span>
                <span className="shrink-0 ml-2 text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                  {(topPick.homeWin
                    ? toKoreanTeamName(topPick.g.homeTeam.name, topPick.g.league) || topPick.g.homeTeam.name
                    : toKoreanTeamName(topPick.g.awayTeam.name, topPick.g.league) || topPick.g.awayTeam.name)}{" "}
                  {Math.round(topPick.top * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-neutral-400">오늘 가장 자신 있는 예측 · 1X2·OU·핸디 동시 추적</p>
            </div>
          ) : (
            <Empty>오늘 예측 가능한 매치가 아직 없습니다.</Empty>
          )}
        </Card>

        {/* 선발 매치업 */}
        <Card title="오늘 선발" Icon={Swords} href="/predictions/starters" hrefLabel="선발 비교">
          {starterGame ? (
            (() => {
              const hs = parseStarter(starterGame.homeStarter)!;
              const as = parseStarter(starterGame.awayStarter)!;
              return (
                <ul className="space-y-1.5">
                  <li className="flex items-center justify-between text-sm">
                    <span>{hs.name ?? "미정"}</span>
                    <span className="text-neutral-500 tabular-nums text-xs">
                      {hs.era != null ? `ERA ${hs.era.toFixed(2)}` : "—"}
                    </span>
                  </li>
                  <li className="flex items-center justify-between text-sm">
                    <span>{as.name ?? "미정"}</span>
                    <span className="text-neutral-500 tabular-nums text-xs">
                      {as.era != null ? `ERA ${as.era.toFixed(2)}` : "—"}
                    </span>
                  </li>
                </ul>
              );
            })()
          ) : (
            <Empty>오늘 선발 매치업 정보가 아직 없습니다.</Empty>
          )}
        </Card>

        {/* 연봉 랭킹 */}
        <Card title="연봉 랭킹" Icon={Coins} badge="KBO" href="/salaries/kbo" hrefLabel="연봉 전체">
          {salaries.length === 0 ? (
            <Empty>연봉 데이터를 불러오는 중입니다.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {salaries.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="inline-block w-5 text-neutral-400 font-bold tabular-nums">{s.rank}</span>
                    {s.playerName}
                  </span>
                  <span className="text-neutral-500 tabular-nums text-xs">{fmtManwon(s.salary)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 주목 선수 */}
        <Card title="주목 선수" Icon={Star} href="/search" hrefLabel="선수 검색">
          <ul className="space-y-1.5">
            {STARS.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="flex items-center justify-between text-sm group transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <span className="font-medium group-hover:underline group-hover:text-rose-600 dark:group-hover:text-rose-400">{p.name}</span>
                  <span className="text-neutral-400 text-[11px]">{p.sub}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        {/* MLB Statcast 리더보드 */}
        <Card title="Statcast 리더보드" Icon={Radar} badge="MLB" href="/baseball/statcast" hrefLabel="전체 순위 보기">
          <p className="text-sm text-neutral-600 dark:text-white/60 leading-relaxed break-keep">
            배럴%·평균 타구속도·하드히트%·xwOBA — 타구질로 본 메이저리그 타자 상위. 선수·팀 단위, Baseball Savant 공식 데이터.
          </p>
        </Card>

        {/* 승리확률 계산기 */}
        <Card title="승리확률 계산기" Icon={Target} badge="KBO·MLB·NPB" href="/tools/kbo-win-probability" hrefLabel="KBO 계산기 열기">
          <p className="text-sm text-neutral-600 dark:text-white/60 leading-relaxed break-keep mb-3">
            이닝·점수차·아웃·주자를 넣으면 상황별 승리확률과 번트·도루의 승률 손익을 즉시 계산합니다.
          </p>
          <ul className="space-y-1.5">
            {[
              { lg: "KBO", href: "/tools/kbo-win-probability" },
              { lg: "MLB", href: "/tools/mlb-win-probability" },
              { lg: "NPB", href: "/tools/npb-win-probability" },
            ].map((t) => (
              <li key={t.lg}>
                <Link href={t.href} className="flex items-center justify-between text-sm group transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <span className="font-medium group-hover:underline group-hover:text-rose-600 dark:group-hover:text-rose-400">{t.lg} 승리확률 계산기</span>
                  <span className="text-neutral-400 text-[11px]">열기</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        오늘 경기·예측은 5분마다 갱신됩니다. 각 카드의 링크에서 전체 데이터를 볼 수 있습니다. 데이터 출처 KBO 공식·MLB Stats API·api-baseball.
      </footer>
    </main>
  );
}

// 리그별 블록 — 순위 Top3 미리보기 + 순위·예측·글·부상 등 모든 진입로 링크.
function LeagueBlock({
  name,
  top3,
  links,
}: {
  name: string;
  top3: { teamId: number; position: number; name: string; points: number }[];
  links: { label: string; href: string }[];
}) {
  return (
    <section className="flex flex-col rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-3">
        <ListOrdered className="w-4 h-4 text-zinc-700 dark:text-white/70" aria-hidden />
        <span className="text-sm font-semibold text-zinc-950 dark:text-white">{name}</span>
      </div>
      <div className="flex-1">
        {top3.length === 0 ? (
          <p className="text-xs text-neutral-400 py-2">순위 데이터 준비 중 (시즌 외일 수 있음).</p>
        ) : (
          <ul className="space-y-1.5">
            {top3.map((t) => (
              <li key={t.teamId} className="flex items-center justify-between text-sm">
                <span className="truncate">
                  <span className="inline-block w-5 text-neutral-400 font-bold tabular-nums">{t.position}</span>
                  {t.name}
                </span>
                <span className="text-neutral-500 tabular-nums text-xs">{t.points}승</span>
              </li>
            ))}
          </ul>
        )}
      </div>
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
    </section>
  );
}

function Card({
  title,
  Icon,
  badge,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  Icon: LucideIcon;
  badge?: string;
  href: string;
  hrefLabel: string;
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
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-zinc-950 dark:text-white/70 dark:hover:text-white"
      >
        {hrefLabel} →
      </Link>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-neutral-400 py-2">{children}</p>;
}
