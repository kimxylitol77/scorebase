"use client";
// NBA 시즌 개요 — 레이더(7축) + 득점/플레이/수비/출전 카드. 축구 PlayerSeasonOverview 패턴.
// 현재시즌 평균(per-game) 기준, 엘리트 시즌 상한으로 0~100 정규화.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { Target, Zap, Shield, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { NbaSeasonAverages } from "@/lib/sports/balldontlie";

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const cap = (v: number, c: number) => clamp((v / c) * 100);

// 레이더 축 — 엘리트 시즌 평균 상한 cap (득점왕 ~30점, 리바 ~12 등).
const AXES: { label: string; cap: number; pick: (a: NbaSeasonAverages) => number; fmt: (v: number) => string }[] = [
  { label: "득점", cap: 30, pick: (a) => a.pts, fmt: (v) => v.toFixed(1) },
  { label: "리바운드", cap: 12, pick: (a) => a.reb, fmt: (v) => v.toFixed(1) },
  { label: "어시스트", cap: 10, pick: (a) => a.ast, fmt: (v) => v.toFixed(1) },
  { label: "스틸", cap: 2.2, pick: (a) => a.stl, fmt: (v) => v.toFixed(1) },
  { label: "블록", cap: 2.2, pick: (a) => a.blk, fmt: (v) => v.toFixed(1) },
  { label: "야투%", cap: 60, pick: (a) => a.fgPct * 100, fmt: (v) => `${v.toFixed(1)}%` },
  { label: "3점%", cap: 45, pick: (a) => a.fg3Pct * 100, fmt: (v) => `${v.toFixed(1)}%` },
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

export default function NbaSeasonOverview({ avg, season }: { avg: NbaSeasonAverages; season: number }) {
  const radarData = AXES.map((a) => {
    const v = a.pick(avg);
    return { axis: a.label, value: Math.round(cap(v, a.cap)), raw: a.fmt(v) };
  });

  const fg = avg.fgPct * 100;
  const fg3 = avg.fg3Pct * 100;
  const stocks = avg.stl + avg.blk; // 스틸+블록

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">시즌 상세 기록</span>
        </h2>
        <span className="text-xs text-neutral-400">
          {season} 시즌 · {avg.gamesPlayed}경기 평균
        </span>
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
                <Radar dataKey="value" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.3} isAnimationActive={false} />
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
          <Card
            title="득점"
            icon={<Target className="w-4 h-4" />}
            accent="text-cyan-600 dark:text-cyan-400"
            barCls="bg-cyan-500"
            bar={cap(fg, 60)}
            rows={[
              ["평균 득점", avg.pts.toFixed(1)],
              ["야투 / 3점", `${fg.toFixed(1)}% · ${fg3.toFixed(1)}%`],
            ]}
          />
          <Card
            title="플레이메이킹"
            icon={<Zap className="w-4 h-4" />}
            accent="text-blue-600 dark:text-blue-400"
            barCls="bg-blue-500"
            bar={cap(avg.ast, 10)}
            rows={[
              ["어시스트", avg.ast.toFixed(1)],
              ["턴오버", avg.turnover.toFixed(1)],
            ]}
          />
          <Card
            title="수비·리바운드"
            icon={<Shield className="w-4 h-4" />}
            accent="text-emerald-600 dark:text-emerald-400"
            barCls="bg-emerald-500"
            bar={cap(stocks, 4)}
            rows={[
              ["리바운드", avg.reb.toFixed(1)],
              ["스틸 / 블록", `${avg.stl.toFixed(1)} · ${avg.blk.toFixed(1)}`],
            ]}
          />
          <Card
            title="출전"
            icon={<Clock className="w-4 h-4" />}
            accent="text-violet-600 dark:text-violet-400"
            barCls="bg-violet-500"
            bar={cap(avg.gamesPlayed, 82)}
            rows={[
              ["경기", String(avg.gamesPlayed)],
              ["평균 시간", `${avg.min}분`],
            ]}
          />
        </div>
      </div>
    </section>
  );
}
