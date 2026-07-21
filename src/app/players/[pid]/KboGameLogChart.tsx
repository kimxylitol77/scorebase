"use client";
// KBO 투수 경기별 평균자책점 추이 — 막대=그 경기 자책점, 라인=그 시점 누적 시즌 ERA.
// 데이터는 KBO 공식 Daily.aspx 의 ER·ERA2 컬럼(시즌 전체 등판 로그)을 그대로 쓴다.

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { KboPitcherDailyGame } from "@/lib/sports/kbo-official";

export default function KboGameLogChart({ games }: { games: KboPitcherDailyGame[] }) {
  const data = games
    .filter((g) => g.cumEra != null)
    .map((g) => ({
      label: g.date,
      자책점: g.er ?? 0,
      누적ERA: g.cumEra,
      상대: g.opponent,
    }));
  // 등판 2회 이하면 "추이"가 아니라 점 두 개 — 표만으로 충분하다.
  if (data.length < 3) return null;

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-base font-bold tracking-tight">경기별 평균자책점 추이</h2>
        <p className="text-xs text-neutral-400">
          막대 = 그 경기 자책점 · 라인 = 그 시점까지의 시즌 평균자책점
        </p>
      </div>
      <div className="h-[260px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 8, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={18}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
            />
            <YAxis
              yAxisId="er"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="era"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                fontSize: 12,
              }}
              labelFormatter={(l, payload) => {
                const opp = payload?.[0]?.payload?.상대;
                return opp ? `${l} vs ${opp}` : String(l);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Bar yAxisId="er" dataKey="자책점" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Line
              yAxisId="era"
              type="monotone"
              dataKey="누적ERA"
              stroke="#f43f5e"
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
