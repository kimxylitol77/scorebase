// 시즌 상세 기록 (영어판). scripts/en-mirror 로 자동 생성.
"use client";
// 선수 시즌 상세 기록 — 레이더(7축) + 90분당 + 슈팅/패스/수비 카드. TheSports player-season-stats 기반.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Target, Compass, Shield, Hand, Clock } from "lucide-react";
import type { ReactNode } from "react";
import { toRadarAxes } from "@/lib/player-radar";
import { RADAR_AXIS_EN } from "@/lib/i18n/en";

interface StatInput {
  lg: string;
  season: string;
  team: string | null;
  matches: number | null;
  starts: number | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
  shots: number | null;
  sot: number | null;
  keyPasses: number | null;
  passAcc: number | null;
  tackles: number | null;
  interceptions: number | null;
  saves: number | null;
}

const n = (v: number | null | undefined) => v ?? 0;
const clamp = (v: number) => Math.max(0, Math.min(100, v));

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

export default function PlayerSeasonOverview({ name, stat }: { name: string; stat: StatInput }) {
  const mins = n(stat.minutes);
  const p90 = (v: number | null) => (mins > 0 ? (n(v) / mins) * 90 : 0);

  const radarData = toRadarAxes(stat).map((a) => ({ ...a, axis: RADAR_AXIS_EN[a.axis] ?? a.axis }));

  const acc = n(stat.shots) > 0 ? Math.round((n(stat.sot) / n(stat.shots)) * 100) : 0;
  const isGk = n(stat.saves) > 0;

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Season detail</span>
        </h2>
        <span className="text-xs text-neutral-400">{stat.season} · {stat.team ?? ""}</span>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* 레이더 */}
        <div className="min-w-0">
          <div className="h-[260px] sm:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(148,163,184,0.25)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="value" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.3} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
                  formatter={(_v, _k, p) => [p?.payload?.raw, p?.payload?.axis]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-center text-[11px] text-neutral-400 mt-1">Hover the radar to see the underlying numbers</p>

          {/* 90분당 지표 — 레이더가 상대 백분위라 절대값을 따로 명시 (buildup 벤치마크) */}
          {!isGk && mins > 0 && (
            <div className="mt-3">
              <div className="mb-1 text-[11px] font-semibold text-neutral-400">Per 90 minutes</div>
              {/* 6칸이라 모바일은 3+3 두 줄로 — 375px 에서 한 줄 6칸은 숫자가 뭉갠다.
                  공격P = 골+도움. 둘을 따로 보면 "얼마나 관여했나"가 한눈에 안 잡힌다. */}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {([
                  ["Goals", p90(stat.goals)],
                  ["Assists", p90(stat.assists)],
                  ["Att. actions", p90(n(stat.goals) + n(stat.assists))],
                  ["Key passes", p90(stat.keyPasses)],
                  ["Tackles", p90(stat.tackles)],
                  ["Interceptions", p90(stat.interceptions)],
                ] as [string, number][]).map(([label, v]) => (
                  <div key={label} className="rounded-lg bg-neutral-50 px-1 py-2 text-center ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                    <div className="text-sm font-bold tabular-nums">{v.toFixed(2)}</div>
                    <div className="text-[10px] text-neutral-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 카드 2x2 */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <Card title="Shots" icon={<Target className="w-4 h-4" />} accent="text-cyan-600 dark:text-cyan-400" barCls="bg-cyan-500" bar={acc}
            rows={[["Total shots", String(n(stat.shots))], ["On target / accuracy", `${n(stat.sot)} · ${acc}%`]]} />
          <Card title="Passing" icon={<Compass className="w-4 h-4" />} accent="text-blue-600 dark:text-blue-400" barCls="bg-blue-500" bar={n(stat.passAcc)}
            rows={[["Key passes", String(n(stat.keyPasses))], ["Pass accuracy", `${Math.round(n(stat.passAcc))}%`]]} />
          <Card title="Defending" icon={<Shield className="w-4 h-4" />} accent="text-emerald-600 dark:text-emerald-400" barCls="bg-emerald-500"
            bar={clamp(((p90(stat.tackles) + p90(stat.interceptions)) / 7) * 100)}
            rows={[["Tackles", String(n(stat.tackles))], ["Interceptions", String(n(stat.interceptions))]]} />
          {isGk ? (
            <Card title="Goalkeeping" icon={<Hand className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500" bar={null}
              rows={[["Saves", String(n(stat.saves))], ["Apps / starts", `${n(stat.matches)} · ${n(stat.starts)}`]]} />
          ) : (
            <Card title="Apps" icon={<Clock className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500"
              bar={n(stat.matches) > 0 ? (n(stat.starts) / n(stat.matches)) * 100 : null}
              rows={[["apps / starts", `${n(stat.matches)} · ${n(stat.starts)}`], ["Minutes played", `${mins.toLocaleString()}'`]]} />
          )}
        </div>
      </div>
    </section>
  );
}
