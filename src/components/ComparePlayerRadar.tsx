"use client";
// 선수 2명 시즌 스탯 레이더 오버레이 — 같은 7축(player-radar.toRadarAxes) 위에 두 선수를 겹쳐 그린다.
// A=로즈, B=시안. 단일 출처 정규화라 선수 페이지(PlayerSeasonOverview)와 축·스케일 동일.

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { toRadarAxes, type RadarStat } from "@/lib/player-radar";

export default function ComparePlayerRadar({
  a,
  b,
  nameA,
  nameB,
}: {
  a: RadarStat;
  b: RadarStat;
  nameA: string;
  nameB: string;
}) {
  const ax = toRadarAxes(a);
  const bx = toRadarAxes(b);
  const data = ax.map((p, i) => ({
    axis: p.axis,
    A: p.value,
    B: bx[i]?.value ?? 0,
    rawA: p.raw,
    rawB: bx[i]?.raw ?? "0",
  }));

  return (
    <div className="h-[300px] sm:h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="rgba(148,163,184,0.25)" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: "#64748b", fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name={nameA} dataKey="A" stroke="#e11d48" fill="#f43f5e" fillOpacity={0.25} />
          <Radar name={nameB} dataKey="B" stroke="#0891b2" fill="#06b6d4" fillOpacity={0.2} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid rgba(148,163,184,0.3)", fontSize: 12 }}
            formatter={(_v, _k, p) => {
              const dk = p?.dataKey;
              const pay = p?.payload as { rawA?: string; rawB?: string } | undefined;
              return [dk === "A" ? pay?.rawA : pay?.rawB, dk === "A" ? nameA : nameB];
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
