// NhlSeasonOverview (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// NHL 시즌 개요 — 레이더 + 카드. 스케이터(골·어시·포인트·슛·PP·출전) / 골리(승·SV%·방어·완봉·출전) 분기.
// 시즌 누적(featured) 기준, 엘리트 시즌 상한으로 0~100 정규화.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Target, Zap, Sparkles, Clock, Shield, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import type { NhlPlayerLanding } from "@/lib/sports/nhl-api";
import { toNhlRadarAxes } from "@/lib/sport-radar";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (v: number, c: number) => clamp((v / c) * 100);
const num = (v: number | undefined) => v ?? 0;

interface RadarPt {
  axis: string;
  value: number;
  raw: string;
}

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

function RadarBlock({ data }: { data: RadarPt[] }) {
  return (
    <div className="min-w-0">
      <div className="h-[260px] sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%">
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
  );
}

function Shell({ seasonStart, children }: { seasonStart: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Detailed season log</span>
        </h2>
        <span className="text-xs text-neutral-400">
          {seasonStart}-{String(seasonStart + 1).slice(2)} Season
        </span>
      </div>
      {children}
    </section>
  );
}

export default function NhlSeasonOverview({ profile, seasonStart }: { profile: NhlPlayerLanding; seasonStart: number }) {
  const f = profile.featured ?? {};
  const isGoalie = profile.position === "G";

  if (isGoalie) {
    const w = num(f.wins);
    const l = num(f.losses);
    const ot = num(f.otLosses);
    const sv = num(f.savePctg);
    const gaa = num(f.goalsAgainstAvg);
    const so = num(f.shutouts);
    const gp = num(f.gamesPlayed);
    const decisions = w + l + ot;
    const winPct = decisions > 0 ? Math.round((w / decisions) * 100) : 0;
    const radar: RadarPt[] = toNhlRadarAxes(profile).axes;
    return (
      <Shell seasonStart={seasonStart}>
        <div className="grid lg:grid-cols-2 gap-5">
          <RadarBlock data={radar} />
          <div className="grid grid-cols-2 gap-3 content-start">
            <Card title="Stats" icon={<Trophy className="w-4 h-4" />} accent="text-cyan-600 dark:text-cyan-400" barCls="bg-cyan-500" bar={cap(w, 40)}
              rows={[["W-L-OT", `${w}-${l}-${ot}`], ["Win %", `${winPct}%`]]} />
            <Card title="Defence" icon={<Shield className="w-4 h-4" />} accent="text-blue-600 dark:text-blue-400" barCls="bg-blue-500" bar={clamp(((sv - 0.88) / 0.05) * 100)}
              rows={[["SV%", sv.toFixed(3)], ["GAA", gaa.toFixed(2)]]} />
            <Card title="SHO" icon={<Sparkles className="w-4 h-4" />} accent="text-emerald-600 dark:text-emerald-400" barCls="bg-emerald-500" bar={cap(so, 8)}
              rows={[["SHO", String(so)], ["Games played", String(gp)]]} />
            <Card title="Apps" icon={<Clock className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500" bar={cap(gp, 60)}
              rows={[["G", String(gp)], ["Shootout", String(decisions)]]} />
          </div>
        </div>
      </Shell>
    );
  }

  // 스케이터
  const g = num(f.goals);
  const a = num(f.assists);
  const pts = num(f.points);
  const sog = num(f.shots);
  const ppg = num(f.powerPlayGoals);
  const gwg = num(f.gameWinningGoals);
  const pim = num(f.pim);
  const gp = num(f.gamesPlayed);
  const radar: RadarPt[] = toNhlRadarAxes(profile).axes;
  return (
    <Shell seasonStart={seasonStart}>
      <div className="grid lg:grid-cols-2 gap-5">
        <RadarBlock data={radar} />
        <div className="grid grid-cols-2 gap-3 content-start">
          <Card title="Attack" icon={<Target className="w-4 h-4" />} accent="text-cyan-600 dark:text-cyan-400" barCls="bg-cyan-500" bar={cap(pts, 120)}
            rows={[["Goals", String(g)], ["Assists", String(a)]]} />
          <Card title="Shots" icon={<Zap className="w-4 h-4" />} accent="text-blue-600 dark:text-blue-400" barCls="bg-blue-500" bar={cap(sog, 350)}
            rows={[["Shots on goal", String(sog)], ["Points", String(pts)]]} />
          <Card title="Special teams" icon={<Sparkles className="w-4 h-4" />} accent="text-emerald-600 dark:text-emerald-400" barCls="bg-emerald-500" bar={cap(ppg, 18)}
            rows={[["PP goals", String(ppg)], ["Winners", String(gwg)]]} />
          <Card title="Apps" icon={<Clock className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500" bar={cap(gp, 82)}
            rows={[["G", String(gp)], ["PIM", String(pim)]]} />
        </div>
      </div>
    </Shell>
  );
}
