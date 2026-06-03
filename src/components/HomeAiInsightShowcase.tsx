// 메인 페이지 — "오늘의 AI 매치 인사이트" 쇼케이스.
// 가까운 LIVE/SCHEDULED 매치 3개의 Elo 기반 승률 추정 + Strong Pick 배지 + CTA.
// 방문자가 라이브 페이지의 매치 인사이트 (5탭) 기능을 메인에서 즉시 인지하게.

import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY, leagueHasDraw } from "@/lib/sports/sport-leagues";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import type { PredictMatch } from "@/lib/predict/types";

// 야구는 자체 라우트, 그 외는 [league] 라우트.
const SELF_ROUTE_LEAGUES = new Set(["KBO", "NPB", "MLB", "LOL"]);

function liveHref(league: string, externalId: string): string {
  const lg = league.toLowerCase();
  if (league === "KBO" || league === "NPB" || league === "MLB") {
    return `/live/${lg}/${externalId}`;
  }
  if (league === "LOL") return `/live/lol/${externalId}`;
  return `/live/${league}/${externalId}`;
}

interface FocusMatch {
  id: number;
  league: string;
  externalId: string;
  status: string;
  startTime: Date;
  homeTeam: { id: number; name: string; logoUrl: string | null };
  awayTeam: { id: number; name: string; logoUrl: string | null };
  homeScore: number | null;
  awayScore: number | null;
}

function fmtKstTime(d: Date): string {
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function fmtKstDate(d: Date): string {
  const m = d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
  });
  return m.replace(/\.\s*$/, "");
}

export default async function HomeAiInsightShowcase() {
  // 가까운 매치 — LIVE 우선, 그 다음 SCHEDULED (now + 12h 이내).
  const now = new Date();
  const horizon = new Date(now.getTime() + 12 * 3600 * 1000);

  const candidates = await prisma.match.findMany({
    where: {
      // 메인 첫 화면 노출 = 주요 리그(발행 화이트리스트)만. 이라크 등 마이너 리그 제외.
      league: { in: [...ARTICLE_LEAGUES] },
      OR: [
        { status: "LIVE" },
        {
          status: "SCHEDULED",
          startTime: { gte: now, lte: horizon },
        },
      ],
    },
    include: {
      homeTeam: { select: { id: true, name: true, logoUrl: true } },
      awayTeam: { select: { id: true, name: true, logoUrl: true } },
    },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    take: 50,
  });

  // 리그 분포 다양 — 같은 리그 최대 1개. 인기 리그 (KBO/MLB/EPL) 우선.
  const PRIORITY = ["KBO", "NPB", "MLB", "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "UCL", "K_LEAGUE_1", "J1_LEAGUE", "NBA", "NHL"];
  const byLeague = new Map<string, FocusMatch>();
  for (const m of candidates) {
    if (!byLeague.has(m.league)) byLeague.set(m.league, m);
  }
  const ordered: FocusMatch[] = [];
  for (const lg of PRIORITY) {
    const m = byLeague.get(lg);
    if (m) ordered.push(m);
    if (ordered.length >= 3) break;
  }
  // 부족하면 priority 외 리그도 추가
  if (ordered.length < 3) {
    for (const [lg, m] of byLeague) {
      if (!PRIORITY.includes(lg) && !ordered.find((o) => o.id === m.id)) {
        ordered.push(m);
        if (ordered.length >= 3) break;
      }
    }
  }
  if (ordered.length === 0) return null;

  // 각 매치 Elo + winProb prep — 같은 league 묶음 query 1번씩.
  const leagueMatchMap = new Map<string, PredictMatch[]>();
  for (const fm of ordered) {
    if (!leagueMatchMap.has(fm.league)) {
      const lgMatches = await prisma.match.findMany({
        where: { league: fm.league },
        select: {
          id: true,
          league: true,
          status: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
          startTime: true,
        },
      });
      leagueMatchMap.set(fm.league, lgMatches);
    }
  }

  const cards = ordered.map((m) => {
    const lgMatches = leagueMatchMap.get(m.league) ?? [];
    const beforeMatches = lgMatches.filter(
      (x) => x.startTime.getTime() < m.startTime.getTime(),
    );
    const eloTable = calcEloTable(beforeMatches);
    const homeElo = getElo(eloTable, m.homeTeam.id);
    const awayElo = getElo(eloTable, m.awayTeam.id);
    const winProb = calcWinProbability(homeElo, awayElo, m.league);
    // 무승부 없는 종목(야구·농구 등)은 무 제거 후 홈/원정만 재정규화 — 야구에 "무 0%" 안 보이게.
    const drawRaw = leagueHasDraw(m.league) ? winProb.draw : 0;
    const total = winProb.home + winProb.away + drawRaw;
    const pHome = total > 0 ? winProb.home / total : 0.5;
    const pAway = total > 0 ? winProb.away / total : 0.5;
    const pDraw = total > 0 ? drawRaw / total : 0;
    const topConf = Math.max(pHome, pAway, pDraw);
    const isStrong = topConf >= 0.65;
    const pickName =
      pHome >= pAway && pHome >= pDraw
        ? toKoreanTeamName(m.homeTeam.name, m.league)
        : pAway >= pDraw
          ? toKoreanTeamName(m.awayTeam.name, m.league)
          : "무승부";
    const isLive = m.status === "LIVE";
    return {
      match: m,
      pHome,
      pAway,
      pDraw,
      pickName,
      pickPct: topConf,
      isStrong,
      isLive,
      href: liveHref(m.league, m.externalId),
    };
  });

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 mb-10"
      aria-label="오늘의 AI 매치 인사이트"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight">
            오늘의 AI 매치 인사이트
          </h2>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Elo 레이팅 기반 승률 추정. 라이브 페이지에서 5탭 (선발·팀전력·AI예측·상대전적·시장odds) 자세히.
          </p>
        </div>
        <Link
          href="/scores"
          className="hidden sm:inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          전체 라이브 →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        {cards.map((c) => (
          <Link
            key={c.match.id}
            href={c.href}
            className="group relative block rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900/50 p-4 sm:p-5 hover:border-neutral-400 dark:hover:border-neutral-600 hover:shadow-md transition"
          >
            {/* 상단 — 리그 + 시간 + LIVE 점 */}
            <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-3">
              <span className="font-medium">{LEAGUE_DISPLAY[c.match.league] ?? c.match.league}</span>
              <span className="flex items-center gap-1.5">
                {c.isLive ? (
                  <>
                    <span className="relative inline-flex w-2 h-2 flex-none">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                    </span>
                    <span className="text-rose-600 dark:text-rose-400 font-semibold">LIVE</span>
                  </>
                ) : (
                  <span className="tabular-nums">
                    {fmtKstDate(c.match.startTime)} {fmtKstTime(c.match.startTime)}
                  </span>
                )}
              </span>
            </div>

            {/* 팀 매치업 */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <TeamSide
                name={toKoreanTeamName(c.match.awayTeam.name, c.match.league)}
                logo={c.match.awayTeam.logoUrl}
                score={c.match.awayScore}
                showScore={c.isLive}
              />
              <span className="text-xs text-neutral-400 shrink-0">vs</span>
              <TeamSide
                name={toKoreanTeamName(c.match.homeTeam.name, c.match.league)}
                logo={c.match.homeTeam.logoUrl}
                score={c.match.homeScore}
                showScore={c.isLive}
                home
              />
            </div>

            {/* 승률 bar */}
            <div className="space-y-1.5">
              <div className="h-2 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 flex">
                <div
                  className="bg-blue-500 dark:bg-blue-400"
                  style={{ width: `${c.pAway * 100}%` }}
                  title={`원정 승 ${(c.pAway * 100).toFixed(0)}%`}
                />
                {c.pDraw > 0 && (
                  <div
                    className="bg-neutral-400"
                    style={{ width: `${c.pDraw * 100}%` }}
                    title={`무승부 ${(c.pDraw * 100).toFixed(0)}%`}
                  />
                )}
                <div
                  className="bg-rose-500 dark:bg-rose-400"
                  style={{ width: `${c.pHome * 100}%` }}
                  title={`홈 승 ${(c.pHome * 100).toFixed(0)}%`}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-neutral-500">
                <span className="text-blue-600 dark:text-blue-400 tabular-nums">{(c.pAway * 100).toFixed(0)}%</span>
                {c.pDraw > 0 && <span className="tabular-nums">{(c.pDraw * 100).toFixed(0)}%</span>}
                <span className="text-rose-600 dark:text-rose-400 tabular-nums">{(c.pHome * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* AI 픽 + 배지 */}
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs">
                <span className="text-neutral-400">AI 픽 </span>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  {c.pickName}
                </span>
                <span className="text-neutral-400 tabular-nums"> · {(c.pickPct * 100).toFixed(0)}%</span>
              </span>
              {c.isStrong && (
                <span className="inline-flex items-center rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-300 dark:ring-amber-300/30 shrink-0">
                  Strong Pick
                </span>
              )}
            </div>

            <div className="mt-2 text-[11px] text-blue-600 dark:text-blue-400 font-medium group-hover:underline">
              매치 인사이트 5탭 보기 →
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TeamSide({
  name,
  logo,
  score,
  showScore,
  home,
}: {
  name: string;
  logo: string | null;
  score: number | null;
  showScore: boolean;
  home?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 min-w-0 flex-1 ${home ? "justify-end text-right" : ""}`}>
      {!home && <TeamLogo src={logo} name={name} />}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold tracking-tight truncate">{name}</div>
        {showScore && score != null && (
          <div className="text-base font-black tabular-nums text-neutral-900 dark:text-white">
            {score}
          </div>
        )}
      </div>
      {home && <TeamLogo src={logo} name={name} />}
    </div>
  );
}

function TeamLogo({ src, name }: { src: string | null; name: string }) {
  if (src) {
    if (src.includes("liquipedia.net")) {
      return (
        <Image
          src={src}
          alt={`${name} 로고`}
          width={32}
          height={32}
          className="w-8 h-8 object-contain bg-white rounded p-0.5 shrink-0"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={`${name} 로고`}
        width={32}
        height={32}
        loading="lazy"
        className="w-8 h-8 object-contain bg-white rounded p-0.5 shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-500 shrink-0">
      {name.charAt(0)}
    </div>
  );
}
