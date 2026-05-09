"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Row {
  name: string;
  value: number; // 0~100 (%)
}

interface Props {
  data: Row[];
  /** "neutral" 기본, "danger" 빨강 (강등 등) */
  variant?: "neutral" | "danger";
  height?: number;
}

function neutralColor(v: number) {
  if (v >= 50) return "#10b981";
  if (v >= 20) return "#3b82f6";
  if (v >= 5) return "#a3a3a3";
  return "#d4d4d4";
}

function dangerColor(v: number) {
  if (v >= 60) return "#dc2626";
  if (v >= 30) return "#f97316";
  if (v >= 10) return "#eab308";
  return "#a3a3a3";
}

export default function MonteCarloBar({
  data,
  variant = "neutral",
  height = 360,
}: Props) {
  const color = variant === "danger" ? dangerColor : neutralColor;
  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 50, bottom: 4, left: 8 }}
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#737373"
            fontSize={12}
            tick={{ fill: "currentColor" }}
            width={120}
          />
          <Tooltip
            cursor={{ fill: "rgba(115,115,115,0.08)" }}
            contentStyle={{
              background: "rgba(23,23,23,0.92)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 12,
            }}
            formatter={(v: unknown) =>
              `${typeof v === "number" ? v.toFixed(1) : v}%`
            }
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((row, i) => (
              <Cell key={i} fill={color(row.value)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
