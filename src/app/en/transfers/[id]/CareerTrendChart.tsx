// 커리어 추이 차트 (영어판). scripts/en-mirror 로 자동 생성.
"use client";
// 시즌별 골·도움 추이 라인차트 — x축에 시즌+당시 구단 로고 (buildup 벤치마크). 데이터는 경력(career-data) 집계.
// ResponsiveContainer 는 숨김 탭(display:none)에서 0 크기로 마운트되면 재측정을 못 해
// 자체 ResizeObserver 로 폭을 재고, 보일 때(>0)만 명시 크기로 렌더한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export interface TrendPoint {
  label: string; // "25/26"
  goals: number;
  assists: number;
  rating: number | null; // 그 시즌 출전수 가중평균 평점 (데이터 없으면 null — 0 으로 채우지 않는다)
  logo: string | null; // 그 시즌 주 소속팀 로고
}

type Mode = "prod" | "rating";

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
  const [mode, setMode] = useState<Mode>("prod");
  // 평점 계열은 값이 2개 이상 있을 때만 토글을 연다 — 점 하나짜리 선은 추이가 아니다.
  const hasRating = useMemo(() => points.filter((p) => p.rating != null).length >= 2, [points]);
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
      <div className="px-4 pt-3.5 pb-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Season by season {mode === "prod" ? "Goals & assists" : "Rating"} trend</h2>
          <p className="text-xs text-neutral-400">
            Club competitions combined · club shown under each season{mode === "rating" ? " · weighted by appearances" : ""}
          </p>
        </div>
        {hasRating && (
          <div className="flex shrink-0 gap-1">
            {(["prod", "rating"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  mode === m
                    ? "bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400"
                    : "text-neutral-500 hover:-translate-y-0.5 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
                }`}
              >
                {m === "prod" ? "Goals & assists" : "Rating"}
              </button>
            ))}
          </div>
        )}
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
            {/* 평점은 6~9 구간이라 0 부터 그리면 선이 납작해진다 — 실제 값 범위로 잡는다. */}
            <YAxis
              allowDecimals={mode === "rating"}
              domain={mode === "rating" ? ["dataMin - 0.3", "dataMax + 0.3"] : [0, "auto"]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
              formatter={(v, name) => [v, name === "goals" ? "Goals" : name === "assists" ? "Assists" : "Rating"]}
            />
            <Legend
              formatter={(v) => (v === "goals" ? "Goals" : v === "assists" ? "Assists" : "Rating")}
              wrapperStyle={{ fontSize: 12, paddingTop: 20 }}
            />
            {mode === "prod" ? (
              <>
                <Line type="monotone" dataKey="goals" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 4, fill: "#ef4444" }} />
                <Line type="monotone" dataKey="assists" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4, fill: "#3b82f6" }} />
              </>
            ) : (
              // connectNulls — 평점이 빈 시즌(유스·기록 없는 대회)에서 선이 끊기면 추이가 안 읽힌다.
              <Line type="monotone" dataKey="rating" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4, fill: "#10b981" }} connectNulls />
            )}
          </LineChart>
        )}
      </div>
    </section>
  );
}
