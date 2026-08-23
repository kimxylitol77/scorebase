// NbaSeasonOverview (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
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
import { toNbaRadarAxes } from "@/lib/sport-radar";

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

export default function NbaSeasonOverview({ avg, season }: { avg: NbaSeasonAverages; season: number }) {
  const radarData = toNbaRadarAxes(avg);

  const fg = avg.fgPct * 100;
  const fg3 = avg.fg3Pct * 100;
  const stocks = avg.stl + avg.blk; // 스틸+블록

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none space-y-5">
      <div className="flex items-baseline gap-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">Detailed season log</span>
        </h2>
        <span className="text-xs text-neutral-400">
          {season} Season · {avg.gamesPlayed}Per game
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
          <p className="text-center text-[11px] text-neutral-400 mt-1">Hover the radar to see the actual numbers</p>
        </div>

        {/* 카드 2x2 */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <Card
            title="R"
            icon={<Target className="w-4 h-4" />}
            accent="text-cyan-600 dark:text-cyan-400"
            barCls="bg-cyan-500"
            bar={cap(fg, 60)}
            rows={[
              ["Points per game", avg.pts.toFixed(1)],
              ["FG / 3PT", `${fg.toFixed(1)}% · ${fg3.toFixed(1)}%`],
            ]}
          />
          <Card
            title="Playmaking"
            icon={<Zap className="w-4 h-4" />}
            accent="text-blue-600 dark:text-blue-400"
            barCls="bg-blue-500"
            bar={cap(avg.ast, 10)}
            rows={[
              ["Assists", avg.ast.toFixed(1)],
              ["Turnovers", avg.turnover.toFixed(1)],
            ]}
          />
          <Card
            title="Defence & rebounding"
            icon={<Shield className="w-4 h-4" />}
            accent="text-emerald-600 dark:text-emerald-400"
            barCls="bg-emerald-500"
            bar={cap(stocks, 4)}
            rows={[
              ["Rebounds", avg.reb.toFixed(1)],
              ["Steals / blocks", `${avg.stl.toFixed(1)} · ${avg.blk.toFixed(1)}`],
            ]}
          />
          <Card
            title="Apps"
            icon={<Clock className="w-4 h-4" />}
            accent="text-violet-600 dark:text-violet-400"
            barCls="bg-violet-500"
            bar={cap(avg.gamesPlayed, 82)}
            rows={[
              ["G", String(avg.gamesPlayed)],
              ["Average time", `${avg.min} min`],
            ]}
          />
        </div>
      </div>
    </section>
  );
}
