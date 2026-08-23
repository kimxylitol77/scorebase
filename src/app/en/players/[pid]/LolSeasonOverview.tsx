// LolSeasonOverview (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// LOL 시즌 개요 — 레이더(KDA·킬·어시·CS/분·승률·생존) + 전투/파밍/성과/챔프 카드.
// DB lolGames 세트 집계(LolPlayerAgg) 기준. 수집된 LCK 경기 범위 내.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Swords, Sprout, Trophy, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { LolPlayerAgg } from "@/lib/sports/lol-player-stats";
import { toLolRadarAxes } from "@/lib/sport-radar";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (v: number, c: number) => clamp((v / c) * 100);

function Card({
  title,
  icon,
  accent,
  barCls,
  rows,
  bar,
}: {
  title: string;
  icon: ReactNode;
  accent: string;
  barCls: string;
  rows: [string, string][];
  bar: number | null;
}) {
  return (
    <div className="rounded-xl bg-white p-3.5 ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className={accent}>{icon}</span>
        <span className={`text-sm font-bold ${accent}`}>{title}</span>
      </div>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between">
            <span className="text-xs text-neutral-500">{k}</span>
            <span className="text-sm font-bold tabular-nums">{v}</span>
          </div>
        ))}
      </div>
      {bar != null && (
        <div className="mt-2.5 h-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
          <div className={`h-full rounded-full ${barCls}`} style={{ width: `${clamp(bar)}%` }} />
        </div>
      )}
    </div>
  );
}

export default function LolSeasonOverview({ agg }: { agg: LolPlayerAgg }) {
  const g = agg.games || 1;
  const kpg = agg.kills / g;
  const dpg = agg.deaths / g;
  const apg = agg.assists / g;
  const winPctNum = agg.winRate * 100;

  const radar = toLolRadarAxes(agg);

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Detailed season log</span>
        </h2>
        <span className="text-xs text-neutral-400">{agg.games}Set totals</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="min-w-0">
          <div className="h-[260px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radar} outerRadius="72%">
                <PolarGrid stroke="rgba(148,163,184,0.25)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.3} isAnimationActive={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
                  formatter={(_v, _k, p) => [p?.payload?.raw, p?.payload?.axis]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-[11px] text-neutral-400 mt-1">Hover the radar to see the actual numbers</p>
        </div>

        <div className="grid grid-cols-2 gap-3 content-start">
          <Card title="Combat" icon={<Swords className="w-4 h-4" />} accent="text-cyan-600 dark:text-cyan-400" barCls="bg-cyan-500" bar={cap(agg.kda, 5)}
            rows={[["KDA", agg.kda.toFixed(2)], ["K/D/A", `${kpg.toFixed(1)}/${dpg.toFixed(1)}/${apg.toFixed(1)}`]]} />
          <Card title="Farming" icon={<Sprout className="w-4 h-4" />} accent="text-blue-600 dark:text-blue-400" barCls="bg-blue-500" bar={cap(agg.csPerMin, 10)}
            rows={[["CS per minute", agg.csPerMin.toFixed(1)], ["CS per game", agg.csPerGame.toFixed(0)]]} />
          <Card title="Honours" icon={<Trophy className="w-4 h-4" />} accent="text-emerald-600 dark:text-emerald-400" barCls="bg-emerald-500" bar={winPctNum}
            rows={[["Win %", `${Math.round(winPctNum)}%`], ["Sets", String(agg.games)]]} />
          <Card title="Champion pool" icon={<Sparkles className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500" bar={cap(agg.champs.length, 15)}
            rows={[["Champions played", `${agg.champs.length}`], ["Total kills / assists", `${agg.kills} / ${agg.assists}`]]} />
        </div>
      </div>
    </section>
  );
}
