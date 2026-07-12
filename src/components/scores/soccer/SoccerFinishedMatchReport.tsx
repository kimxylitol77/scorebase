"use client";

import { useState } from "react";
import { Activity, Star, Target } from "lucide-react";
import MatchTrendChart, { type MatchTrendData } from "@/components/live/MatchTrendChart";
import type { SoccerGoal } from "@/lib/sports/live-scores";

type StatPair = [number, number];

interface PhaseStats {
  [statId: string]: StatPair | undefined;
}

interface HalfTeamStats {
  ft?: PhaseStats | null;
  p1?: PhaseStats | null;
  p2?: PhaseStats | null;
}

interface LineupPlayer {
  id?: string;
  name?: string;
  rating?: string | number;
}

interface LineupData {
  lineup?: {
    home?: LineupPlayer[];
    away?: LineupPlayer[];
  };
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  homeScore?: number | null;
  awayScore?: number | null;
  regulationHomeScore?: number | null;
  regulationAwayScore?: number | null;
  xgHome?: number | null;
  xgAway?: number | null;
  halfTeamStats?: HalfTeamStats | null;
  trend?: MatchTrendData | null;
  goals?: SoccerGoal[] | null;
  lineup?: unknown;
  nameById?: Record<string, string>;
}

type PhaseKey = "ft" | "p1" | "p2";

const PHASES: Array<{ key: PhaseKey; label: string; scoreLabel: string }> = [
  { key: "ft", label: "전체", scoreLabel: "최종" },
  { key: "p1", label: "전반", scoreLabel: "전반" },
  { key: "p2", label: "후반", scoreLabel: "후반" },
];

const CORE_STATS = [
  { id: "25", label: "점유율", percent: true },
  { id: "83", label: "슈팅", percent: false },
  { id: "21", label: "유효 슈팅", percent: false },
  { id: "2", label: "코너킥", percent: false },
] as const;

function hasPhaseStats(stats: PhaseStats | null | undefined): boolean {
  return CORE_STATS.some(({ id }) => {
    const value = stats?.[id];
    return !!value && (Number(value[0]) > 0 || Number(value[1]) > 0);
  });
}

function getTopPlayers(
  lineup: unknown,
  homeNameKo: string,
  awayNameKo: string,
  nameById: Record<string, string>,
) {
  const data = lineup as LineupData | null;
  const sides = [
    { players: data?.lineup?.home ?? [], team: homeNameKo, side: "home" as const },
    { players: data?.lineup?.away ?? [], team: awayNameKo, side: "away" as const },
  ];

  return sides
    .flatMap(({ players, team, side }) =>
      players.map((player) => {
        const rating = Number(player.rating ?? 0);
        const fallback = player.name?.trim() || "";
        const name = (player.id && nameById[player.id]) || fallback;
        return { id: player.id, name, rating, team, side };
      }),
    )
    .filter((player) => player.name && Number.isFinite(player.rating) && player.rating > 0)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3);
}

function XgComparison({
  homeNameKo,
  awayNameKo,
  xgHome,
  xgAway,
}: {
  homeNameKo: string;
  awayNameKo: string;
  xgHome: number;
  xgAway: number;
}) {
  const home = Math.max(0, xgHome);
  const away = Math.max(0, xgAway);
  const total = home + away;
  const homeWidth = total > 0 ? (home / total) * 100 : 50;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950 sm:p-5">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight sm:text-base">
          <Target className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          기대득점 xG
        </h3>
        <span className="text-[11px] text-neutral-500">슈팅 위치·상황 반영</span>
      </header>
      <div
        className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] sm:gap-3"
        role="img"
        aria-label={`기대득점 ${homeNameKo} ${home.toFixed(2)}, ${awayNameKo} ${away.toFixed(2)}`}
      >
        <strong className="text-right text-xl tabular-nums text-rose-600 dark:text-rose-400 sm:text-2xl">
          {home.toFixed(2)}
        </strong>
        <div className="min-w-0">
          <div className="mb-1.5 grid grid-cols-2 gap-2 text-[10px] font-medium text-neutral-500">
            <span className="truncate text-left">{homeNameKo}</span>
            <span className="truncate text-right">{awayNameKo}</span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
            <span className="h-full bg-rose-500" style={{ width: `${homeWidth}%` }} />
            <span className="h-full bg-blue-500" style={{ width: `${100 - homeWidth}%` }} />
          </div>
        </div>
        <strong className="text-left text-xl tabular-nums text-blue-600 dark:text-blue-400 sm:text-2xl">
          {away.toFixed(2)}
        </strong>
      </div>
    </section>
  );
}

function PhaseComparison({
  halfTeamStats,
  homeNameKo,
  awayNameKo,
}: {
  halfTeamStats: HalfTeamStats;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const available = PHASES.filter(({ key }) => hasPhaseStats(halfTeamStats[key]));
  const [phase, setPhase] = useState<PhaseKey>(available[0]?.key ?? "ft");
  if (available.length === 0) return null;

  const active = available.some(({ key }) => key === phase) ? phase : available[0].key;
  const stats = halfTeamStats[active];
  const score = stats?.["1"];
  const phaseMeta = PHASES.find(({ key }) => key === active) ?? PHASES[0];
  const rows = CORE_STATS.flatMap((metric) => {
    const value = stats?.[metric.id];
    if (!value || (Number(value[0]) === 0 && Number(value[1]) === 0)) return [];
    return [{ ...metric, home: Number(value[0]), away: Number(value[1]) }];
  });

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950 sm:p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold tracking-tight sm:text-base">전반·후반 비교</h3>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            {score ? `${phaseMeta.scoreLabel} 스코어 ${score[0]}-${score[1]}` : "구간별 경기 지표"}
          </p>
        </div>
        <div
          className="inline-flex shrink-0 rounded-md bg-neutral-100 p-1 dark:bg-neutral-900"
          role="group"
          aria-label="통계 구간 선택"
        >
          {available.map((item) => {
            const selected = item.key === active;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={selected}
                onClick={() => setPhase(item.key)}
                className={`min-w-12 rounded px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  selected
                    ? "bg-white text-neutral-950 shadow-sm dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-semibold">
        <span className="truncate text-right text-rose-600 dark:text-rose-400">{homeNameKo}</span>
        <span className="text-[10px] font-medium text-neutral-400">VS</span>
        <span className="truncate text-left text-blue-600 dark:text-blue-400">{awayNameKo}</span>
      </div>

      <ul className="space-y-3">
        {rows.map((row) => {
          const total = row.home + row.away;
          const homeWidth = total > 0 ? (row.home / total) * 100 : 50;
          return (
            <li key={row.id} className="grid grid-cols-[3rem_minmax(0,1fr)_3rem] items-center gap-2 sm:grid-cols-[4rem_minmax(0,1fr)_4rem] sm:gap-3">
              <strong className="text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100 sm:text-base">
                {row.home}{row.percent ? "%" : ""}
              </strong>
              <div className="min-w-0">
                <div className="mb-1 text-center text-[10px] font-medium text-neutral-500">{row.label}</div>
                <div className="flex h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <span className="h-full bg-rose-500" style={{ width: `${homeWidth}%` }} />
                  <span className="h-full bg-blue-500" style={{ width: `${100 - homeWidth}%` }} />
                </div>
              </div>
              <strong className="text-left text-sm tabular-nums text-neutral-900 dark:text-neutral-100 sm:text-base">
                {row.away}{row.percent ? "%" : ""}
              </strong>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function SoccerFinishedMatchReport({
  homeNameKo,
  awayNameKo,
  homeScore,
  awayScore,
  regulationHomeScore,
  regulationAwayScore,
  xgHome,
  xgAway,
  halfTeamStats,
  trend,
  goals,
  lineup,
  nameById = {},
}: Props) {
  const hasXg =
    xgHome != null &&
    xgAway != null &&
    Number.isFinite(xgHome) &&
    Number.isFinite(xgAway);
  const hasTrend = !!trend?.data?.some((half) => Array.isArray(half) && half.length > 0);
  const hasHalfStats = !!halfTeamStats && PHASES.some(({ key }) => hasPhaseStats(halfTeamStats[key]));
  const topPlayers = getTopPlayers(lineup, homeNameKo, awayNameKo, nameById);
  const wentToExtraTime =
    homeScore != null &&
    awayScore != null &&
    regulationHomeScore != null &&
    regulationAwayScore != null &&
    (homeScore !== regulationHomeScore || awayScore !== regulationAwayScore);
  if (!hasXg && !hasTrend && !hasHalfStats && topPlayers.length === 0) return null;

  return (
    <section aria-labelledby="finished-match-report-title" className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-white/10">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            종료 경기 데이터
          </div>
          <h2 id="finished-match-report-title" className="text-lg font-bold tracking-tight sm:text-xl">
            경기 리포트
          </h2>
        </div>
        {wentToExtraTime ? (
          <div className="text-right text-[11px] leading-5 text-neutral-500">
            <div className="font-semibold text-neutral-700 dark:text-neutral-300">연장 종료</div>
            <div className="tabular-nums">
              정규 {regulationHomeScore}-{regulationAwayScore} · 최종 {homeScore}-{awayScore}
            </div>
          </div>
        ) : (
          <span className="shrink-0 text-xs text-neutral-500">실시간 기록 보존</span>
        )}
      </header>

      {hasXg && (
        <XgComparison
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
          xgHome={xgHome}
          xgAway={xgAway}
        />
      )}

      {hasTrend && trend && (
        <MatchTrendChart
          trend={trend}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
          homeScore={homeScore}
          awayScore={awayScore}
          goals={goals}
        />
      )}

      {hasHalfStats && halfTeamStats && (
        <PhaseComparison
          halfTeamStats={halfTeamStats}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {topPlayers.length > 0 && (
        <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-white/10 dark:bg-neutral-950 sm:p-5">
          <header className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight sm:text-base">
              <Star className="h-4 w-4 text-amber-500" aria-hidden="true" />
              주요 선수
            </h3>
            <span className="text-[11px] text-neutral-500">경기 평점 상위</span>
          </header>
          <ol className="divide-y divide-neutral-100 dark:divide-white/10">
            {topPlayers.map((player, index) => (
              <li key={`${player.side}-${player.id ?? player.name}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 py-2.5 pr-14 first:pt-0 last:pb-0 sm:pr-0">
                <span className="text-xs font-bold tabular-nums text-neutral-400">{index + 1}</span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{player.name}</div>
                  <div className={`truncate text-[11px] ${player.side === "home" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>
                    {player.team}
                  </div>
                </div>
                <strong className="text-base tabular-nums text-neutral-900 dark:text-neutral-100">
                  {player.rating.toFixed(2)}
                </strong>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
