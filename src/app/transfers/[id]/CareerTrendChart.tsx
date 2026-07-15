"use client";
// 시즌별 골·도움 추이 라인차트 — x축에 시즌+당시 구단 로고 (buildup 벤치마크). 데이터는 경력(career-data) 집계.
// ResponsiveContainer 는 숨김 탭(display:none)에서 0 크기로 마운트되면 재측정을 못 해
// 자체 ResizeObserver 로 폭을 재고, 보일 때(>0)만 명시 크기로 렌더한다.
import { useEffect, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export interface TrendPoint {
  label: string; // "25/26"
  goals: number;
  assists: number;
  logo: string | null; // 그 시즌 주 소속팀 로고
}

// x축 tick — 시즌 라벨 아래 구단 로고. recharts tick 콜백은 props 타입이 느슨해 필요한 필드만 뽑는다.
function SeasonTick(props: unknown & { points: TrendPoint[] }) {
  const { x, y, payload, points } = props as { x?: number; y?: number; payload?: { value?: string }; points: TrendPoint[] };
  const p = points.find((t) => t.label === payload?.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={12} textAnchor="middle" fill="#94a3b8" fontSize={11}>
        {payload?.value}
      </text>
      {p?.logo && <image href={p.logo} x={-9} y={18} width={18} height={18} />}
    </g>
  );
}

export default function CareerTrendChart({ points }: { points: TrendPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;
  return (
    <section className="rounded-xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
      <div className="px-4 pt-3.5 pb-1">
        <h2 className="text-lg font-semibold">시즌별 골·도움 추이</h2>
        <p className="text-xs text-neutral-400">클럽 대회 합산 · 시즌 아래는 당시 소속팀</p>
      </div>
      <div ref={ref} className="h-[250px] px-2 pb-3">
        {width > 0 && (
          <LineChart width={width - 8} height={238} data={points} margin={{ top: 12, right: 18, bottom: 26, left: -18 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="label"
              tick={(props) => <SeasonTick {...props} points={points} />}
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
            />
            <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
              formatter={(v, name) => [v, name === "goals" ? "골" : "도움"]}
            />
            <Legend formatter={(v) => (v === "goals" ? "골" : "도움")} wrapperStyle={{ fontSize: 12, paddingTop: 20 }} />
            <Line type="monotone" dataKey="goals" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} />
            <Line type="monotone" dataKey="assists" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} />
          </LineChart>
        )}
      </div>
    </section>
  );
}
