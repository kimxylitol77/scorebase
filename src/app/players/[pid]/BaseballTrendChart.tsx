"use client";
// 야구 선수 시즌별 성적 추이 라인차트 (MLB/KBO/NPB 공통) — career 시즌 row 를 그대로 받는다.
// 타자=OBP/SLG/OPS 슬래시라인(같은 축), 투수=ERA/FIP(같은 축, 낮을수록 좋음).

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
import type { HitterSeasonRow, PitcherSeasonRow } from "@/lib/sports/mlb-player-extras";

const num = (x: string | number | undefined | null): number | undefined => {
  if (x == null || x === "") return undefined;
  const n = Number(x);
  return Number.isFinite(n) ? n : undefined;
};

// 시즌 라벨 — "2021" → "'21" (폭 절약).
const seasonLabel = (s: string): string => (s.length === 4 ? `'${s.slice(2)}` : s);

function Chart({
  data,
  lines,
  title,
  hint,
}: {
  data: Record<string, number | string | undefined>[];
  lines: { key: string; name: string; color: string; width?: number }[];
  title: string;
  hint: string;
}) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-neutral-400">{hint}</p>
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
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={l.width ?? 2.5}
                dot={{ r: 3, fill: l.color }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function HitterTrendChart({ rows }: { rows: HitterSeasonRow[] }) {
  const data = rows
    .map((r) => ({
      label: seasonLabel(r.season),
      OBP: num(r.obp),
      SLG: num(r.slg),
      OPS: num(r.ops),
    }))
    .filter((d) => d.OBP != null || d.SLG != null || d.OPS != null);
  if (data.length < 2) return null;
  return (
    <Chart
      data={data}
      title="시즌별 슬래시라인 추이"
      hint="OBP · SLG · OPS — 위로 갈수록 생산성 상승"
      lines={[
        { key: "OBP", name: "OBP", color: "#3b82f6" },
        { key: "SLG", name: "SLG", color: "#10b981" },
        { key: "OPS", name: "OPS", color: "#ef4444", width: 3 },
      ]}
    />
  );
}

export function PitcherTrendChart({ rows }: { rows: PitcherSeasonRow[] }) {
  const data = rows
    .map((r) => ({
      label: seasonLabel(r.season),
      ERA: num(r.era),
      FIP: num(r.fip),
    }))
    .filter((d) => d.ERA != null || d.FIP != null);
  if (data.length < 2) return null;
  const hasFip = data.some((d) => d.FIP != null);
  return (
    <Chart
      data={data}
      title="시즌별 ERA · FIP 추이"
      hint={hasFip ? "낮을수록 좋음 · FIP=운·수비 무관 실질 방어율" : "낮을수록 좋음"}
      lines={[
        { key: "ERA", name: "ERA", color: "#f43f5e", width: 3 },
        ...(hasFip ? [{ key: "FIP", name: "FIP", color: "#3b82f6" }] : []),
      ]}
    />
  );
}
