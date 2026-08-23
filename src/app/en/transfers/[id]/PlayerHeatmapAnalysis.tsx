// 시즌 활동 분석 (영어판). scripts/en-mirror 로 자동 생성.
"use client";

import HeatPitch from "./HeatPitch";

export interface HeatmapCell {
  x: number;
  y: number;
  count: number;
}

export interface PlayerHeatmapData {
  source: string;
  seasonLabel: string;
  matches: number;
  minutes: number;
  summary: {
    weightedPoints: number;
    averageX: number;
    averageY: number;
    defensiveThirdPct: number;
    middleThirdPct: number;
    attackingThirdPct: number;
    leftPct: number;
    centerPct: number;
    rightPct: number;
  };
  cells: HeatmapCell[];
}

function pct(value: number): string {
  return `${Math.round(value)}%`;
}

export function MetricBar({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
        <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
        <span className="font-bold tabular-nums text-neutral-900 dark:text-white">{pct(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
        <div className={`h-full rounded-full ${accent}`} style={{ width: `${Math.max(3, value)}%` }} />
      </div>
    </div>
  );
}

export default function PlayerHeatmapAnalysis({ name, data }: { name: string; data: PlayerHeatmapData }) {
  const { summary } = data;
  const mainSide = summary.rightPct >= summary.leftPct ? "the right" : "the left";

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-black/5 px-4 py-4 dark:border-white/10 sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Player activity</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">Season activity</h2>
        </div>
        <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
          <div className="font-semibold text-neutral-700 dark:text-neutral-200">{data.seasonLabel}</div>
          <div className="mt-0.5 tabular-nums">{data.matches} matches · {data.minutes.toLocaleString()} min</div>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div>
          <HeatPitch points={data.cells.map((c) => ({ x: c.x + 5, y: c.y + 5, w: c.count }))} ariaLabel="Season activity heatmap" />
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-neutral-500">
            <span>Low</span>
            <span
              className="h-1.5 flex-1 rounded-full"
              style={{ background: "linear-gradient(to right, #1c4a2a, #a8e03c 30%, #fcdc30 55%, #fc821c 78%, #e22628)" }}
            />
            <span>High</span>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-2 text-center lg:grid-cols-1">
            <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
              <div className="text-lg font-black tabular-nums">{pct(summary.attackingThirdPct)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">Final third</div>
            </div>
            <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
              <div className="text-lg font-black tabular-nums">{summary.averageX.toFixed(1)}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">Average position</div>
            </div>
            <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
              <div className="text-lg font-black tabular-nums">{summary.weightedPoints.toLocaleString()}</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">Total touches</div>
            </div>
          </div>

          <div className="space-y-3">
            <MetricBar label="Defensive third" value={summary.defensiveThirdPct} accent="bg-emerald-500" />
            <MetricBar label="Middle third" value={summary.middleThirdPct} accent="bg-amber-400" />
            <MetricBar label="Attacking third" value={summary.attackingThirdPct} accent="bg-red-500" />
          </div>

          <p className="rounded-lg bg-emerald-500/[0.07] px-3 py-2.5 text-xs leading-5 text-neutral-700 ring-1 ring-emerald-500/10 dark:text-neutral-200">
            {name} was most active through the middle, and down the flanks favoured {mainSide} .
          </p>
        </div>
      </div>

      <p className="border-t border-black/5 px-4 py-3 text-[10px] leading-4 text-neutral-400 dark:border-white/10 sm:px-5">
        Season position data from TheStatsAPI. Pitch coordinates (0–100) aggregated into a 10×10 grid of activity density.
      </p>
    </section>
  );
}
