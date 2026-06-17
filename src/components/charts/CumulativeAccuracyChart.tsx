"use client";

// 리그별 누적 적중률 추이 — 시즌 진행률(x, 0~100%) 대비 1X2 누적 적중률(y) 라인.
// 경기가 쌓일수록 적중률이 수렴하는 모습 = 모델 안정성의 시각 증거. 범례 클릭으로 리그 토글.

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export interface AccSeriesPoint {
  pct: number; // 시즌 진행률 0~100
  [league: string]: number; // 리그 한글명 → 그 시점까지 누적 적중률(%)
}
export interface AccLeagueMeta {
  key: string;
  name: string; // 한글명 (dataKey)
  color: string;
  sample: number; // 평가 표본 수
  finalRate: number; // 최종 누적 적중률(%)
}

interface Props {
  data: AccSeriesPoint[];
  leagues: AccLeagueMeta[];
}

export default function CumulativeAccuracyChart({ data, leagues }: Props) {
  // 기본적으로 표본 상위 6개만 표시 (스파게티 방지). 나머지는 범례 클릭으로 on.
  const initialHidden = new Set(
    [...leagues].sort((a, b) => b.sample - a.sample).slice(6).map((l) => l.name),
  );
  const [hidden, setHidden] = useState<Set<string>>(initialHidden);

  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, bottom: 0, left: -16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
            <XAxis
              dataKey="pct"
              type="number"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="#737373"
              fontSize={11}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              stroke="#737373"
              fontSize={11}
              domain={[30, 90]}
              ticks={[30, 40, 50, 60, 70, 80, 90]}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "currentColor" }}
            />
            <Tooltip
              formatter={(v, n) => [`${Number(v).toFixed(1)}%`, n as string]}
              labelFormatter={(l) => `시즌 진행 ${l}%`}
              contentStyle={{
                backgroundColor: "var(--tooltip-bg, #fff)",
                border: "1px solid #e5e5e5",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <ReferenceLine y={50} stroke="#a3a3a3" strokeDasharray="2 2" />
            {leagues
              .filter((l) => !hidden.has(l.name))
              .map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.name}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 커스텀 범례 — 클릭 토글 + 리그별 최종 누적 적중률 */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {leagues.map((l) => {
          const off = hidden.has(l.name);
          return (
            <button
              key={l.key}
              onClick={() => toggle(l.name)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                off
                  ? "border-neutral-200 dark:border-neutral-700 opacity-40"
                  : "border-neutral-300 dark:border-neutral-600"
              }`}
              title={`${l.name} · 표본 ${l.sample.toLocaleString()}경기`}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              <span className="font-medium">{l.name}</span>
              <span className="tabular-nums text-neutral-500">{l.finalRate.toFixed(0)}%</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        x축 = 시즌 진행률(0~100%) · y축 = 그 시점까지 1X2 누적 적중률 · 점선 = 50% 기준선. 범례를 눌러
        리그를 켜고 끌 수 있습니다.
      </p>
    </div>
  );
}
