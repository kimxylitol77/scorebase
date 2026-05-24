"use client";

import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  homeProb: number;
  drawProb: number;
  awayProb: number;
  homeName: string;
  awayName: string;
  hideDraw?: boolean;
}

const COLORS = {
  home: "#3b82f6", // blue-500
  draw: "#a3a3a3", // neutral-400
  away: "#f43f5e", // rose-500
};

function pct(p: number) {
  return Math.round(p * 100);
}

export default function WinProbDonut({
  homeProb,
  drawProb,
  awayProb,
  homeName,
  awayName,
  hideDraw = false,
}: Props) {
  const home = pct(homeProb);
  const draw = hideDraw ? 0 : pct(drawProb);
  const away = pct(awayProb);

  const data = hideDraw
    ? [
        { name: homeName, value: home, key: "home" },
        { name: awayName, value: away, key: "away" },
      ]
    : [
        { name: homeName, value: home, key: "home" },
        { name: "무승부", value: draw, key: "draw" },
        { name: awayName, value: away, key: "away" },
      ];

  // 가장 큰 값 강조
  const dominant = home >= Math.max(draw, away)
    ? "home"
    : away >= draw
      ? "away"
      : "draw";

  return (
    <div className="grid sm:grid-cols-[200px_1fr] gap-4 items-center">
      <div className="relative h-[200px] flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={86}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              paddingAngle={2}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={COLORS[d.key as keyof typeof COLORS]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgba(23,23,23,0.92)",
                border: "none",
                borderRadius: 8,
                color: "white",
                fontSize: 12,
              }}
              formatter={(v: unknown, n: unknown) => [`${v}%`, String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-3xl font-black tabular-nums">
            {dominant === "home" ? home : dominant === "away" ? away : draw}%
          </div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-neutral-500 mt-0.5">
            {dominant === "home"
              ? "홈 우세"
              : dominant === "away"
                ? "원정 우세"
                : "무승부 가능"}
          </div>
        </div>
      </div>

      <ul className="space-y-2 text-sm">
        <Row name={homeName} pct={home} color={COLORS.home} suffix="🏠" />
        {!hideDraw && <Row name="무승부" pct={draw} color={COLORS.draw} />}
        <Row name={awayName} pct={away} color={COLORS.away} suffix="✈" />
      </ul>
    </div>
  );
}

function Row({
  name,
  pct,
  color,
  suffix,
}: {
  name: string;
  pct: number;
  color: string;
  suffix?: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className="w-3 h-3 rounded-sm flex-shrink-0"
        style={{ background: color }}
      />
      <span className="flex-1 truncate font-medium">
        {name} {suffix && <span className="text-neutral-400 text-xs">{suffix}</span>}
      </span>
      <span className="tabular-nums font-bold w-10 text-right">{pct}%</span>
    </li>
  );
}
