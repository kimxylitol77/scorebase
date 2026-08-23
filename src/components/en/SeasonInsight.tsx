// components__SeasonInsight (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import { prisma } from "@/lib/db";
import Link from "next/link";
import LeagueBadge from "./LeagueBadge";
import { calcStandings } from "@/lib/predict/standings";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { formatChampionPct } from "@/lib/format";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import type { PredictMatch } from "@/lib/predict/types";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { stripBaseballAllStarMatches } from "@/lib/sports/baseball/allstar";

interface Props {
  league:
    | "EPL"
    | "NBA"
    | "NHL"
    | "MLB"
    | "LALIGA"
    | "BUNDESLIGA"
    | "SERIE_A"
    | "LIGUE_1"
    | "MLS"
    | "UCL";
}

const LEAGUE_INFO: Record<
  Props["league"],
  { name: string; subtitle: string; relegationCount: number; showDraw: boolean }
> = {
  EPL: {
    name: "Premier League",
    subtitle: "English Premier League · 2025-26 season",
    relegationCount: 3,
    showDraw: true,
  },
  NBA: {
    name: "NBA",
    subtitle: "National Basketball Association · 2025-26 season",
    relegationCount: 0,
    showDraw: false,
  },
  NHL: {
    name: "NHL",
    subtitle: "National Hockey League · 2025-26 season",
    relegationCount: 0,
    showDraw: false,
  },
  MLB: {
    name: "MLB",
    subtitle: "Major League Baseball · 2026 season",
    relegationCount: 0,
    showDraw: false,
  },
  LALIGA: {
    name: "LaLiga",
    subtitle: "La Liga · 2025-26 season",
    relegationCount: 3,
    showDraw: true,
  },
  BUNDESLIGA: {
    name: "Bundesliga",
    subtitle: "Bundesliga · 2025-26 season",
    relegationCount: 3,
    showDraw: true,
  },
  SERIE_A: {
    name: "Serie A",
    subtitle: "Serie A · 2025-26 season",
    relegationCount: 3,
    showDraw: true,
  },
  LIGUE_1: {
    name: "Ligue 1",
    subtitle: "Ligue 1 · 2025-26 season",
    relegationCount: 2,
    showDraw: true,
  },
  MLS: {
    name: "MLS",
    subtitle: "Major League Soccer · 2026 season",
    relegationCount: 0,
    showDraw: true,
  },
  UCL: {
    name: "Champions League",
    subtitle: "UEFA Champions League · 2025-26",
    relegationCount: 0,
    showDraw: true,
  },
};

export default async function SeasonInsight({ league }: Props) {
  const info = LEAGUE_INFO[league];

  const dbMatches = await prisma.match.findMany({
    where: { league },
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
  // 올스타전 제외 — MLB All-Stars 가 순위표에 정규팀처럼 끼어든다
  const matches: PredictMatch[] = stripBaseballAllStarMatches(dbMatches).map((m) => ({ ...m }));

  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;

  if (finishedCount < 10) {
    return null; // 데이터 부족 시 섹션 자체 숨김
  }

  const standings = calcStandings(matches);
  const elo = calcEloTable(matches);
  const teams = await prisma.team.findMany({
    where: { league, id: { in: standings.rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const teamName = (id: number) => {
    const raw = teams.find((t) => t.id === id)?.name;
    return raw ? toEnglishTeamName(raw) : `Team ${id}`;
  };

  const top1 = standings.rows[0];
  const top2 = standings.rows[1];
  const gapTop = top2 ? top1.points - top2.points : 0;

  // 공격/수비 1위
  const attackBest = [...standings.rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => b.goalsFor / b.played - a.goalsFor / a.played)[0];
  const defenseBest = [...standings.rows]
    .filter((r) => r.played >= 5)
    .sort((a, b) => a.goalsAgainst / a.played - b.goalsAgainst / b.played)[0];

  // Monte Carlo (메인 페이지는 ISR 1시간 캐싱이라 안전)
  let mcChampions: Array<{ teamId: number; pct: number }> = [];
  let mcRelegation: Array<{ teamId: number; pct: number }> = [];
  if (scheduledCount > 0) {
    const mc = runMonteCarlo(matches, league, {
      iterations: 1000,
      relegationCount: info.relegationCount,
    });
    mcChampions = mc
      .filter((r) => r.champion >= 0.001)
      .slice(0, 3)
      .map((r) => ({ teamId: r.teamId, pct: r.champion * 100 }));
    if (info.relegationCount > 0) {
      mcRelegation = mc
        .filter((r) => r.relegation >= 0.05)
        .sort((a, b) => b.relegation - a.relegation)
        .slice(0, 3)
        .map((r) => ({ teamId: r.teamId, pct: r.relegation * 100 }));
    }
  }

  // 다가오는 빅매치 (Elo 합 가장 높은 1경기)
  const upcoming = matches
    .filter((m) => m.status === "SCHEDULED")
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    .slice(0, 12);

  const bigMatch = upcoming
    .map((m) => ({
      m,
      score: getElo(elo, m.homeTeamId) + getElo(elo, m.awayTeamId),
    }))
    .sort((a, b) => b.score - a.score)[0]?.m;

  let bigMatchProb: { home: number; draw: number; away: number } | null = null;
  if (bigMatch) {
    bigMatchProb = calcWinProbability(
      getElo(elo, bigMatch.homeTeamId),
      getElo(elo, bigMatch.awayTeamId),
      league,
    );
  }

  const totalRounds =
    finishedCount + scheduledCount > 0
      ? finishedCount + scheduledCount
      : 0;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      {/* 헤더 */}
      <div className="border-b border-black/5 px-6 pt-6 pb-5 dark:border-white/10">
        <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-white/45">
          {info.subtitle}
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-950 dark:text-white">
            {info.name} insight
          </h2>
          <div className="text-xs tabular-nums text-zinc-500 dark:text-white/45">
            {finishedCount} / {totalRounds} matches played
          </div>
        </div>
      </div>

      {/* 본문 */}
      <div className="flex flex-1 flex-col space-y-5 p-6">
        {/* 분석 글 — 자연 한국어 문장 */}
        <div className="prose prose-neutral dark:prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-strong:text-neutral-900 dark:prose-strong:text-white">
          <p>
            <strong>{teamName(top1.teamId)}</strong> lead the table on{" "}
            <strong className="tabular-nums">{top1.points} points</strong>.{" "}
            {top2 ? (
              <>
                Second-placed <strong>{teamName(top2.teamId)}</strong> (
                <span className="tabular-nums">{top2.points} pts</span>) are{" "}
                {gapTop === 0 ? (
                  "level on points"
                ) : (
                  <>
                    <strong className="tabular-nums">{gapTop} points</strong> behind
                  </>
                )}
                , and{" "}
                {gapTop >= 8
                  ? "the title picture is narrowing fast."
                  : gapTop >= 4
                    ? "the chase still has room for a late twist."
                    : "the race at the top looks set to run to the final day."}
              </>
            ) : (
              "no one else is close."
            )}
          </p>

          {attackBest && defenseBest && (
            <p>
              In attack,{" "}
              <strong>{teamName(attackBest.teamId)}</strong> are the sharpest side in the
              league at{" "}
              <strong className="tabular-nums">
                {(attackBest.goalsFor / attackBest.played).toFixed(2)} goals
              </strong>{" "}
              per game, while{" "}
              <strong>{teamName(defenseBest.teamId)}</strong> have the meanest defence,
              conceding{" "}
              <strong className="tabular-nums">
                {(defenseBest.goalsAgainst / defenseBest.played).toFixed(2)} goals
              </strong>{" "}
              a game.
            </p>
          )}

          {mcChampions.length > 0 && (
            <p>
              Across 5,000 simulations built on Elo ratings, the title odds come out at{" "}
              {mcChampions.map((c, i) => (
                <span key={c.teamId}>
                  {i > 0 && (i === mcChampions.length - 1 ? " and " : ", ")}
                  <strong>{teamName(c.teamId)}</strong>{" "}
                  <strong className="tabular-nums">{formatChampionPct(c.pct / 100)}</strong>
                </span>
              ))}
              .
              {mcRelegation.length > 0 && (
                <>
                  {" "}At the other end (bottom {info.relegationCount}), the relegation risk
                  runs{" "}
                  {mcRelegation
                    .map((r) => `${teamName(r.teamId)} ${formatChampionPct(r.pct / 100)}`)
                    .join(", ")}
                  .
                </>
              )}
            </p>
          )}

          {bigMatch && bigMatchProb && (
            <p>
              The next big fixture is{" "}
              <strong>
                {teamName(bigMatch.homeTeamId)} vs {teamName(bigMatch.awayTeamId)}
              </strong>
              . Combining both sides' season form with the Elo gap, the estimated win
              probabilities are{" "}
              <strong className="tabular-nums">
                {Math.round(bigMatchProb.home * 100)}% /{" "}
                {Math.round(bigMatchProb.draw * 100)}% /{" "}
                {Math.round(bigMatchProb.away * 100)}%
              </strong>{" "}
              (home / draw / away).
            </p>
          )}
        </div>

        {/* 핵심 지표 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <Stat
            label="1st"
            value={teamName(top1.teamId)}
            subtle={`${top1.points} pts`}
          />
          {top2 && (
            <Stat
              label="2nd"
              value={teamName(top2.teamId)}
              subtle={`${top2.points} pts`}
            />
          )}
          {attackBest && (
            <Stat
              label="Best attack"
              value={teamName(attackBest.teamId)}
              subtle={`${(attackBest.goalsFor / attackBest.played).toFixed(2)} goals/game`}
            />
          )}
          {defenseBest && (
            <Stat
              label="Best defence"
              value={teamName(defenseBest.teamId)}
              subtle={`${(defenseBest.goalsAgainst / defenseBest.played).toFixed(2)} conceded/game`}
            />
          )}
        </div>

        {/* 액션 링크 */}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-black/5 pt-3 dark:border-white/10">
          <LeagueBadge league={league} />
          <Link
            href={`/en/predictions/${league}`}
            className="ml-auto text-sm font-semibold text-zinc-700 hover:underline dark:text-white/70"
          >
            Full season projection →
          </Link>
          <Link
            href={`/en/standings/${league}`}
            className="text-sm font-semibold text-zinc-700 hover:underline dark:text-white/70"
          >
            {info.name} articles →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: string;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-white/45">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-zinc-950 dark:text-white">
        {value}
      </div>
      {subtle && (
        <div className="text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
          {subtle}
        </div>
      )}
    </div>
  );
}
