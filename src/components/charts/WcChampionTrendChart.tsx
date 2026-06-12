"use client";

// 월드컵 우승 확률 추이 — WorldCupSimSnapshot 일일 스냅샷 기반 라인 차트.
// 최신 스냅샷 기준 우승 확률 TOP 6 국가만 표시 (전 48개국은 가독성 X).

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";

export interface WcTrendPoint {
  date: string; // MM/DD
  [team: string]: string | number | null;
}

interface Props {
  data: WcTrendPoint[];
  teams: { name: string; color: string }[]; // 표시 국가 (한글명) + 라인 색
}

export default function WcChampionTrendChart({ data, teams }: Props) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis dataKey="date" stroke="#737373" fontSize={11} tick={{ fill: "currentColor" }} />
          <YAxis
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            tickFormatter={(v: number) => `${v}%`}
            domain={[0, "auto"]}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(1)}%`]}
            contentStyle={{
              backgroundColor: "var(--tooltip-bg, #fff)",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {teams.map((t) => (
            <Line
              key={t.name}
              type="monotone"
              dataKey={t.name}
              stroke={t.color}
              strokeWidth={2}
              dot={{ r: 2.5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
