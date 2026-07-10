"use client";

// AI 예측 성적표 누적 적중률 추이 — 채점 경기수(x) 대비 두 AI 의 누적 1X2 적중률(y) 라인.
// 우리 모델(로즈) vs GPT-5.6(에메랄드). 경기가 쌓일수록 누가 앞서가는지 수렴 곡선으로 보여준다.

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";

export interface TrendPoint {
  n: number; // 채점 누적 경기수
  "우리 모델": number; // 누적 적중률 %
  "GPT-5.6": number;
}

export default function ScorecardTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis
            dataKey="n"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fontSize: 11, fill: "#a1a1aa" }}
            tickLine={false}
            axisLine={false}
            unit="%"
          />
          <ReferenceLine y={50} stroke="#d4d4d8" strokeDasharray="4 4" />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.06)",
              fontSize: 12,
            }}
            formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n as string]}
            labelFormatter={(n) => `${n}경기째`}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="우리 모델"
            stroke="#f43f5e"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="GPT-5.6"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
