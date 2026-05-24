"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
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
  height,
}: Props) {
  const color = variant === "danger" ? dangerColor : neutralColor;
  // 데이터 행 개수에 비례해서 height 산출 (각 행 32px + padding 32px) — 너무 작으면 80px 최소.
  const computedHeight =
    height ?? Math.max(80, data.length * 32 + 32);
  return (
    <div style={{ height: computedHeight, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
          barCategoryGap="20%"
        >
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis
            type="category"
            dataKey="name"
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            width={92}
            interval={0}
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
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={false}
          >
            {data.map((row, i) => (
              <Cell key={i} fill={color(row.value)} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              fontSize={11}
              fill="#737373"
              formatter={(v: unknown) =>
                typeof v === "number" ? `${v.toFixed(1)}%` : ""
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
