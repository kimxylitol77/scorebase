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

// 레이더 축 정의 — per90 지표는 cap 으로 0~100 정규화, %지표(정확도)는 그대로.
const AXES: {
  label: string;
  raw: (s: StatInput, p90: (v: number | null) => number) => { v: number; text: string };
}[] = [
  { label: "골/90", raw: (s, p90) => ({ v: clamp((p90(s.goals) / 0.8) * 100), text: p90(s.goals).toFixed(2) }) },
  { label: "도움/90", raw: (s, p90) => ({ v: clamp((p90(s.assists) / 0.6) * 100), text: p90(s.assists).toFixed(2) }) },
  { label: "슈팅 정확도", raw: (s) => { const a = n(s.shots) > 0 ? (n(s.sot) / n(s.shots)) * 100 : 0; return { v: clamp(a), text: `${Math.round(a)}%` }; } },
  { label: "키패스/90", raw: (s, p90) => ({ v: clamp((p90(s.keyPasses) / 3) * 100), text: p90(s.keyPasses).toFixed(2) }) },
  { label: "패스 정확도", raw: (s) => ({ v: clamp(n(s.passAcc)), text: `${Math.round(n(s.passAcc))}%` }) },
  { label: "태클/90", raw: (s, p90) => ({ v: clamp((p90(s.tackles) / 4.5) * 100), text: p90(s.tackles).toFixed(2) }) },
  { label: "인터셉트/90", raw: (s, p90) => ({ v: clamp((p90(s.interceptions) / 2.5) * 100), text: p90(s.interceptions).toFixed(2) }) },
];

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

  const radarData = AXES.map((a) => {
    const { v, text } = a.raw(stat, p90);
    return { axis: a.label, value: Math.round(v), raw: text };
  });

  const acc = n(stat.shots) > 0 ? Math.round((n(stat.sot) / n(stat.shots)) * 100) : 0;
  const isGk = n(stat.saves) > 0;

  // 90분당 타일
  const per90 = [
    { label: "골/90", v: p90(stat.goals).toFixed(2), cls: "text-cyan-600 dark:text-cyan-400" },
    { label: "도움/90", v: p90(stat.assists).toFixed(2), cls: "text-blue-600 dark:text-blue-400" },
    { label: "슛/90", v: p90(stat.shots).toFixed(2), cls: "text-sky-600 dark:text-sky-400" },
    { label: "키패스/90", v: p90(stat.keyPasses).toFixed(2), cls: "text-indigo-600 dark:text-indigo-400" },
    { label: "태클/90", v: p90(stat.tackles).toFixed(2), cls: "text-emerald-600 dark:text-emerald-400" },
    { label: "인터셉트/90", v: p90(stat.interceptions).toFixed(2), cls: "text-teal-600 dark:text-teal-400" },
  ];

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">시즌 상세 기록</span>
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
          <p className="text-center text-[11px] text-neutral-400 mt-1">레이더에 마우스를 올리면 실제 수치가 표시됩니다</p>
        </div>

        {/* 카드 2x2 */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <Card title="슈팅" icon={<Target className="w-4 h-4" />} accent="text-cyan-600 dark:text-cyan-400" barCls="bg-cyan-500" bar={acc}
            rows={[["총 슛", String(n(stat.shots))], ["유효 / 정확도", `${n(stat.sot)} · ${acc}%`]]} />
          <Card title="패스" icon={<Compass className="w-4 h-4" />} accent="text-blue-600 dark:text-blue-400" barCls="bg-blue-500" bar={n(stat.passAcc)}
            rows={[["키패스", String(n(stat.keyPasses))], ["패스 정확도", `${Math.round(n(stat.passAcc))}%`]]} />
          <Card title="수비" icon={<Shield className="w-4 h-4" />} accent="text-emerald-600 dark:text-emerald-400" barCls="bg-emerald-500"
            bar={clamp(((p90(stat.tackles) + p90(stat.interceptions)) / 7) * 100)}
            rows={[["태클", String(n(stat.tackles))], ["인터셉트", String(n(stat.interceptions))]]} />
          {isGk ? (
            <Card title="골키핑" icon={<Hand className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500" bar={null}
              rows={[["세이브", String(n(stat.saves))], ["출전 / 선발", `${n(stat.matches)} · ${n(stat.starts)}`]]} />
          ) : (
            <Card title="출전" icon={<Clock className="w-4 h-4" />} accent="text-violet-600 dark:text-violet-400" barCls="bg-violet-500"
              bar={n(stat.matches) > 0 ? (n(stat.starts) / n(stat.matches)) * 100 : null}
              rows={[["경기 / 선발", `${n(stat.matches)} · ${n(stat.starts)}`], ["출전 시간", `${mins.toLocaleString()}'`]]} />
          )}
        </div>
      </div>

      {/* 90분당 */}
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-xs font-bold text-neutral-500">90분당 기록</span>
          <span className="text-[11px] text-neutral-400">{mins.toLocaleString()}분 기준</span>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {per90.map((t) => (
            <div key={t.label} className="rounded-lg bg-white px-2 py-2.5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 text-center">
              <div className="text-[10px] text-neutral-500">{t.label}</div>
              <div className={`text-base font-black tabular-nums ${t.cls}`}>{t.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
