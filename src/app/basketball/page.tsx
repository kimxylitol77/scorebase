// 농구 종목 허브 — 오늘 경기·리그별 순위/예측/글/역사·AI 예측을 한 페이지에.
// 축구(/soccer)·야구(/baseball) 허브와 동일 패턴. 국내(KBL/WKBL)는 데이터 수집 시작 단계라 순위만 graceful.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { toKoreanTeamName } from "@/lib/team-names";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import type { PredictMatch } from "@/lib/predict/types";
import { Clock, ListOrdered, Target, ArrowLeftRight, Coins, GitCompare, Award, Swords, Activity, HeartPulse, type LucideIcon } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";

export const revalidate = 300;

interface Top3Row {
  teamId: number;
  position: number;
  name: string;
  points: number;
}

// 농구 순위 Top3 — 매치 W-L 로 계산(getFullStandings 는 축구/야구용이라 농구는 빈값, calcStandings 사용).
// 시즌 경계(WNBA 등)는 그 창으로, 경계 없는 NBA 는 최근 종료 매치 기준 롤링 윈도(~10개월)로 한 시즌만
// (NBA 는 season-window 미등록 → null 이면 전 시즌 합산돼 79승 같은 값이 나옴). 중복 네임스페이스는 이름 dedup.
const sel = {
  id: true, league: true, status: true,
  homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true,
} as const;

async function hoopsTop3(league: string): Promise<Top3Row[]> {
  const seasonStart = currentSeasonStart(league);
  let matches: PredictMatch[];
  if (seasonStart) {
    matches = await prisma.match.findMany({
      where: { league, startTime: { gte: seasonStart } },
      select: sel,
    });
    if (matches.filter((m) => m.status === "FINISHED").length < 5) {
      matches = await prisma.match.findMany({
        where: { league, startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart } },
        select: sel,
      });
    }
  } else {
    const latest = await prisma.match.findFirst({
      where: { league, status: "FINISHED" },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    });
    if (!latest) return [];
    const from = new Date(latest.startTime.getTime() - 300 * 24 * 3600_000);
    matches = await prisma.match.findMany({ where: { league, startTime: { gte: from } }, select: sel });
  }
  if (matches.filter((m) => m.status === "FINISHED").length === 0) return [];

  const rows = calcStandings(matches).rows;
  const teams = await prisma.team.findMany({
    where: { id: { in: rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name] as const));
  // 이름 dedup — NBA 중복 팀 row 는 승 많은 쪽만 남김(정렬이 승 내림차순이라 첫 등장 유지).
  const seen = new Set<string>();
  const out: Top3Row[] = [];
  for (const r of rows) {
    const name = toKoreanTeamName(nameById.get(r.teamId) ?? String(r.teamId), league);
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ teamId: r.teamId, position: out.length + 1, name, points: r.wins });
    if (out.length === 3) break;
  }
  return out;
}

export const metadata: Metadata = {
  title: "농구 — NBA·WNBA·KBL 오늘 경기·순위·AI 예측 한눈에",
  description:
    "NBA·WNBA·KBL·WKBL 오늘 경기, 리그 순위, AI 승부 예측, 트랜잭션, 연봉 랭킹을 한 페이지에서. 스코어베이스 농구 허브.",
  alternates: { canonical: "https://www.scorebase.kr/basketball" },
};

const BASKETBALL = ["NBA", "WNBA", "KBL", "WKBL", "NBA_SL"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function BasketballHub() {
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const midnightUtcMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600_000;
  const startUtc = new Date(midnightUtcMs);
  const endUtc = new Date(midnightUtcMs + 24 * 3600_000);

  const [games, nbaTop3, wnbaTop3, kblTop3, wkblTop3, spMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: { in: BASKETBALL },
        startTime: { gte: startUtc, lte: endUtc },
        status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
      },
      select: {
        id: true,
        league: true,
        startTime: true,
        status: true,
        homeScore: true,
        awayScore: true,
        predHome: true,
        predAway: true,
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
    }),
    hoopsTop3("NBA").catch(() => []),
    hoopsTop3("WNBA").catch(() => []),
    hoopsTop3("KBL").catch(() => []),
    hoopsTop3("WKBL").catch(() => []),
    prisma.match.findMany({
      where: { league: { in: BASKETBALL }, predCorrect: { not: null } },
      select: { predCorrect: true, predHome: true, predAway: true, league: true },
    }),
  ]);

  // 농구 Strong Pick(리그별 임계) 적중률
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
      return { g, top: Math.max(ph, pa), homeWin: ph >= pa };
    })
    .filter((x) => x.top >= 0.6)
    .sort((a, b) => b.top - a.top)[0];

  const tabs = [
    { label: "농구 홈", href: "/basketball", active: true },
    { label: "라이브 스코어", href: "/scores", active: false },
    { label: "AI 적중률", href: "/predictions/accuracy", active: false },
    { label: "선수 비교", href: "/compare", active: false },
  ];

  // 리그별 블록 — 데이터 지원 범위에 맞춘 안전 링크만.
  const LEAGUE_BLOCKS: {
    code: string;
    name: string;
    note?: string;
    top3: typeof nbaTop3;
    links: { label: string; href: string }[];
  }[] = [
    {
      code: "NBA",
      name: "NBA",
      top3: nbaTop3,
      links: [
        // 순위 링크 제거 — /standings/NBA 는 Team 중복(ESPN↔TheSports id 충돌)으로 순위표를 막아둔 빈 페이지.
        // Top3 미리보기는 위 카드에 이미 노출. 재수집 후 순위표 복구되면 링크 부활.
        { label: "AI 예측", href: "/predictions/NBA" },
        { label: "글·분석", href: "/leagues/NBA" },
        { label: "역사", href: "/leagues/NBA?view=history" },
        { label: "부상자", href: "/injuries/NBA" },
        { label: "트랜잭션", href: "/transactions/nba" },
        { label: "연봉", href: "/salaries/nba" },
      ],
    },
    {
      code: "WNBA",
      name: "WNBA",
      note: "미국 여자프로농구",
      top3: wnbaTop3,
      links: [
        { label: "순위", href: "/standings/WNBA" },
        { label: "AI 예측", href: "/predictions/WNBA" },
      ],
    },
    {
      code: "KBL",
      name: "KBL",
      note: "국내 남자프로농구 · 데이터 수집 시작",
      top3: kblTop3,
      links: [{ label: "순위", href: "/leagues/KBL" }],
    },
    {
      code: "WKBL",
      name: "WKBL",
      note: "국내 여자프로농구 · 준비 중",
      top3: wkblTop3,
      links: [{ label: "순위", href: "/leagues/WKBL" }],
    },
  ];

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden /> 농구 허브
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-8 h-8 shrink-0" aria-hidden>
              <circle cx="12" cy="12" r="9" />
              <path d="M3 12h18M12 3v18" />
              <path d="M5.6 5.6a12 12 0 0 0 12.8 12.8M18.4 5.6A12 12 0 0 1 5.6 18.4" />
            </svg>
            농구
          </h1>
          <span className="text-sm text-neutral-400">NBA · WNBA · KBL · WKBL</span>
        </div>
        <p className="text-sm text-neutral-500 break-keep">
          오늘 경기부터 리그별 순위·AI 예측·역대 우승·트랜잭션까지 한 페이지에서.
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

      {/* 리그별 — 순위·예측·글·역사·부상 모든 진입로 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">리그별</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {LEAGUE_BLOCKS.map((lg) => (
            <LeagueBlock key={lg.code} name={lg.name} note={lg.note} top3={lg.top3} links={lg.links} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 오늘 경기 */}
        <Card title="오늘 경기" Icon={Clock} badge={`${games.length}경기`} href="/scores" hrefLabel="전체 경기">
          {games.length === 0 ? (
            <Empty>오늘 예정된 농구 경기가 없습니다.</Empty>
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
                      <span className="tabular-nums font-semibold">{scored ? `${g.homeScore} - ${g.awayScore}` : "vs"}</span>{" "}
                      {away}
                    </span>
                    <span className={`shrink-0 ml-2 text-[11px] tabular-nums ${g.status === "LIVE" ? "text-red-500 font-bold" : "text-neutral-400"}`}>
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
              <p className="text-[11px] text-neutral-400">오늘 가장 자신 있는 예측 · 승패·OU·핸디 동시 추적</p>
            </div>
          ) : (
            <Empty>오늘 예측 가능한 경기가 아직 없습니다.</Empty>
          )}
        </Card>
      </div>

      {/* 기능 바로가기 */}
      <div className="flex flex-wrap gap-2 pt-1">
        <FnChip href="/transactions/nba" Icon={ArrowLeftRight} label="NBA 트랜잭션 · 트레이드·FA" />
        <FnChip href="/salaries/nba" Icon={Coins} label="NBA 연봉 랭킹" />
        <FnChip href="/compare?sport=NBA" Icon={GitCompare} label="선수 비교" />
        <FnChip href="/predictions" Icon={Target} label="시즌 예측" />
        <FnChip href="/predictions/scorecard" Icon={Award} label="AI 성적표" />
        <FnChip href="/picks" Icon={Swords} label="승부예측 투표" />
        <FnChip href="/odds?sport=basketball" Icon={Activity} label="배당 흐름" />
        <FnChip href="/injuries/NBA" Icon={HeartPulse} label="NBA 부상자" />
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        오늘 경기·예측은 5분마다 갱신됩니다. 국내 프로농구(KBL·WKBL)는 데이터 수집 초기 단계로 순차 확대됩니다. 데이터 출처 ESPN·api-sports·TheSports.
      </footer>
    </main>
  );
}

// 리그별 블록 — 순위 Top3 미리보기 + 순위·예측·글·역사 등 진입로.
function LeagueBlock({
  name,
  note,
  top3,
  links,
}: {
  name: string;
  note?: string;
  top3: { teamId: number; position: number; name: string; points: number }[];
  links: { label: string; href: string }[];
}) {
  return (
    <section className="flex flex-col rounded-[1.5rem] sm:rounded-[2rem] bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]">
      <div className="flex items-center gap-1.5 mb-1">
        <ListOrdered className="w-4 h-4 text-zinc-700 dark:text-white/70" aria-hidden />
        <span className="text-sm font-semibold text-zinc-950 dark:text-white">{name}</span>
      </div>
      {note && <p className="text-[11px] text-neutral-400 mb-2 break-keep">{note}</p>}
      <div className="flex-1">
        {top3.length === 0 ? (
          <p className="text-xs text-neutral-400 py-2">순위 데이터 준비 중.</p>
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
