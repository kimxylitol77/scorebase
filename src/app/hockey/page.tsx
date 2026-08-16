// 하키 종목 허브 — 오늘 경기·리그별 순위/예측/글·역사·AI 예측을 한 페이지에.
// 농구(/basketball)·야구(/baseball) 허브와 동일 패턴. NHL 은 공식 API 로 순위/선수/예측 완비,
// IIHF 세계선수권(국제)은 경기·스코어만 커버돼 Top3 미리보기 + /scores 링크만 노출.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { toKoreanTeamName } from "@/lib/team-names";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import type { PredictMatch } from "@/lib/predict/types";
import { Clock, ListOrdered, Target, Users, GitCompare, HeartPulse, Coins, Award, Swords, Activity, type LucideIcon } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";

export const revalidate = 300;

interface Top3Row {
  teamId: number;
  position: number;
  name: string;
  points: number;
}

// 하키 순위 Top3 — 매치 W-L 로 계산(정식 순위는 리그 링크의 공식 API 표로). 하키는 무승부가 없어
// (연장·슛아웃 결판) 승수 기준 미리보기로 충분. 시즌 경계는 season-window(NHL=8/1) 기준,
// 미등록 리그(IIHF)는 최근 종료 매치 기준 롤링 윈도(~10개월)로 한 시즌만. 중복 네임스페이스는 이름 dedup.
const sel = {
  id: true, league: true, status: true,
  homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, startTime: true,
} as const;

async function standingsTop3(league: string): Promise<Top3Row[]> {
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
  // 이름 dedup — 중복 팀 row 는 승 많은 쪽만 남김(정렬이 승 내림차순이라 첫 등장 유지).
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
  title: "하키 — NHL·세계선수권·호주·뉴질랜드 오늘 경기·순위·선수·AI 예측",
  description:
    "NHL·IIHF 세계선수권·호주 AIHL·뉴질랜드 NZIHL 오늘 경기, 리그 순위, 선수 기록, AI 승부 예측, 부상자 명단을 한 페이지에서. 스코어베이스 하키 허브.",
  alternates: { canonical: "https://www.scorebase.kr/hockey" },
};

const HOCKEY = [
  "NHL", "IIHF_WC", "AIHL", "NZIHL", "HOCKEY_FRIENDLY",
  "KHL", "CHL_HOCKEY", "LIIGA", "SWISS_NL", "CZECH_EXTRALIGA",
  "SLOVAK_EXTRALIGA", "DENMARK_METAL", "KAZAKHSTAN_CUP", "BELARUS_SALEI_CUP",
];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function HockeyHub() {
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const kstNow = new Date(Date.now() + 9 * 3600_000);
  const midnightUtcMs =
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()) - 9 * 3600_000;
  const startUtc = new Date(midnightUtcMs);
  const endUtc = new Date(midnightUtcMs + 24 * 3600_000);

  const [games, nhlTop3, iihfTop3, spMatches, nhlTeams] = await Promise.all([
    prisma.match.findMany({
      where: {
        league: { in: HOCKEY },
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
    standingsTop3("NHL").catch(() => []),
    standingsTop3("IIHF_WC").catch(() => []),
    prisma.match.findMany({
      where: { league: { in: HOCKEY }, predCorrect: { not: null } },
      select: { predCorrect: true, predHome: true, predAway: true, league: true },
    }),
    prisma.team.findMany({
      where: { league: "NHL" },
      select: { id: true, name: true, logoUrl: true },
    }),
  ]);

  // NHL 팀 → 각 팀 페이지의 로스터로. 한글 팀명 가나다 정렬.
  const nhlTeamCards = nhlTeams
    .map((t) => ({ id: t.id, logoUrl: t.logoUrl, name: toKoreanTeamName(t.name, "NHL") || t.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  // 하키 Strong Pick(리그별 임계) 적중률
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
    { label: "하키 홈", href: "/hockey", active: true },
    { label: "라이브 스코어", href: "/scores", active: false },
    { label: "AI 적중률", href: "/predictions/accuracy", active: false },
    { label: "선수 비교", href: "/compare", active: false },
  ];

  // 리그별 블록 — 데이터 지원 범위에 맞춘 안전 링크만.
  const LEAGUE_BLOCKS: {
    code: string;
    name: string;
    note?: string;
    top3: typeof nhlTop3;
    links: { label: string; href: string }[];
  }[] = [
    {
      code: "NHL",
      name: "NHL",
      note: "북미 프로 아이스하키",
      top3: nhlTop3,
      links: [
        { label: "순위", href: "/standings/NHL" },
        { label: "선수 기록", href: "/leagues/NHL?view=stats" },
        { label: "AI 예측", href: "/predictions/NHL" },
        { label: "글·분석", href: "/leagues/NHL" },
        { label: "역사", href: "/leagues/NHL?view=history" },
        { label: "부상자", href: "/injuries/NHL" },
      ],
    },
    {
      code: "IIHF_WC",
      name: "세계선수권",
      note: "IIHF 국가대표 · 경기·스코어 커버",
      top3: iihfTop3,
      links: [{ label: "경기 일정", href: "/scores" }],
    },
    // 남반구 리그 — NHL 오프시즌(6~9월)에 하키 탭을 채운다.
    // ⚠️ top3 는 비운다. TheSports 하키는 season/table 구독 권한이 없고 diary 도 최근 30일만
    //    열려 시즌 전체 결과를 못 채운다 — 부분 집계를 "순위"로 내보내면 사실을 왜곡한다.
    {
      code: "AIHL",
      name: "호주 아이스하키",
      note: "AIHL · 4~9월 시즌 · 경기·스코어 커버",
      top3: [],
      links: [{ label: "경기 일정", href: "/scores" }],
    },
    {
      code: "NZIHL",
      name: "뉴질랜드 아이스하키",
      note: "NZIHL · 5~8월 시즌 · 경기·스코어 커버",
      top3: [],
      links: [{ label: "경기 일정", href: "/scores" }],
    },
  ];

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-5">
      <AmbientGlow />
      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" aria-hidden /> 하키 허브
        </span>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8 shrink-0" aria-hidden>
              <path d="M4 4l7 14h6" />
              <circle cx="20" cy="18" r="1.5" fill="currentColor" stroke="none" />
            </svg>
            하키
          </h1>
          <span className="text-sm text-neutral-400">NHL · 세계선수권 · 호주 · 뉴질랜드</span>
        </div>
        <p className="text-sm text-neutral-500 break-keep">
          오늘 경기부터 리그 순위·선수 기록·AI 예측·부상자 명단까지 한 페이지에서.
        </p>
        <nav className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => (
            <Link
              key={t.label}
              href={t.href}
              className={`shrink-0 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                t.active
                  ? "border-sky-500 text-sky-600 dark:text-sky-400"
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
        <div className="grid gap-4 sm:grid-cols-2">
          {LEAGUE_BLOCKS.map((lg) => (
            <LeagueBlock key={lg.code} name={lg.name} note={lg.note} top3={lg.top3} links={lg.links} />
          ))}
        </div>
      </section>

      {/* NHL 팀 — 각 팀 로스터(선수 명단) 진입 */}
      {nhlTeamCards.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-500">
            NHL 팀 · 로스터
          </h2>
          <p className="text-[11px] text-neutral-400 -mt-1">팀을 누르면 전체 선수 명단(로스터)과 시즌 성적을 볼 수 있습니다.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {nhlTeamCards.map((t) => (
              <Link
                key={t.id}
                href={`/teams/${t.id}`}
                className="flex items-center gap-2 rounded-2xl bg-white p-3 ring-1 ring-black/5 shadow-[0_12px_40px_-24px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-md dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
              >
                <TeamBadge logoUrl={t.logoUrl} size={24} className="bg-white rounded shrink-0" />
                <span className="truncate text-sm font-medium text-zinc-900 dark:text-neutral-200">{t.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* 오늘 경기 */}
        <Card title="오늘 경기" Icon={Clock} badge={`${games.length}경기`} href="/scores" hrefLabel="전체 경기">
          {games.length === 0 ? (
            <Empty>오늘 예정된 하키 경기가 없습니다.</Empty>
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
                      {g.league === "IIHF_WC" ? "세계선수권" : g.league} · {tag}
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
        <FnChip href="/standings/NHL" Icon={ListOrdered} label="NHL 순위표" />
        <FnChip href="/salaries/nhl" Icon={Coins} label="NHL 연봉 랭킹" />
        <FnChip href="/injuries/NHL" Icon={HeartPulse} label="NHL 부상자 명단" />
        <FnChip href="/compare?sport=NHL" Icon={GitCompare} label="선수 비교" />
        <FnChip href="/predictions/NHL" Icon={Users} label="NHL 플레이오프 브래킷" />
        <FnChip href="/picks" Icon={Swords} label="승부예측 투표" />
        <FnChip href="/odds?sport=hockey" Icon={Activity} label="배당 흐름" />
        <FnChip href="/predictions/scorecard" Icon={Award} label="AI 성적표" />
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
        오늘 경기·예측은 5분마다 갱신됩니다. NHL 은 정규시즌 10월~4월, 세계선수권은 5월, 남반구 리그(호주 AIHL·뉴질랜드 NZIHL)는 4~9월에 열립니다. 데이터 출처 NHL 공식·ESPN·TheSports.
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
            className="inline-flex items-center rounded-full border border-neutral-200 dark:border-white/10 px-2.5 py-1 text-xs font-medium text-neutral-700 dark:text-neutral-300 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-sky-400 hover:text-sky-600 dark:hover:text-sky-400"
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
