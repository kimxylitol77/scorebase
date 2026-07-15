"use client";
// NBA 선수 시즌별 성적 추이 라인차트 — PTS·REB·AST 를 한 차트에.
// year>0 인 시즌만(통산 row 제외), 2개 이상 시즌일 때만 렌더.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { NbaSeasonRow } from "@/lib/sports/espn-nba-player";

export function NbaTrendChart({ rows }: { rows: NbaSeasonRow[] }) {
  const data = rows
    .filter((r) => r.year > 0)
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      label: `'${String(r.year).slice(2)}`,
      PTS: r.pts,
      REB: r.reb,
      AST: r.ast,
    }));
  if (data.length < 2) return null;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-base font-bold tracking-tight">시즌별 PTS · REB · AST 추이</h2>
        <p className="text-xs text-neutral-400">경기당 평균 — 시즌에 따른 성장·하락 흐름</p>
      </div>
      <div className="h-[240px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="label"
              interval={0}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
            />
            <YAxis
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              width={44}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Line type="monotone" dataKey="PTS" name="PTS" stroke="#ef4444" strokeWidth={3} dot={{ r: 3, fill: "#ef4444" }} connectNulls />
            <Line type="monotone" dataKey="REB" name="REB" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
            <Line type="monotone" dataKey="AST" name="AST" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: "#10b981" }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
