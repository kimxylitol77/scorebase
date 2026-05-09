"use client";

// 산점도: x = 경기당 평균 득점, y = 경기당 평균 실점 (낮을수록 좋음).
// 모든 팀을 회색 점으로, 양 팀을 큰 컬러 점으로 강조.

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  ReferenceLine,
} from "recharts";

interface Point {
  name: string;
  goalsFor: number;
  goalsAgainst: number;
  highlight?: "home" | "away" | null;
}

interface Props {
  points: Point[];
  /** 리그 평균 (참조선용) */
  leagueAvgGF: number;
  leagueAvgGA: number;
}

export default function GoalScatter({
  points,
  leagueAvgGF,
  leagueAvgGA,
}: Props) {
  const others = points.filter((p) => !p.highlight);
  const home = points.find((p) => p.highlight === "home");
  const away = points.find((p) => p.highlight === "away");

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis
            type="number"
            dataKey="goalsFor"
            name="경기당 득점"
            domain={[0, "dataMax + 0.3" as unknown as number]}
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            label={{
              value: "경기당 득점 →",
              position: "insideBottom",
              offset: -5,
              fontSize: 10,
              fill: "#737373",
            }}
          />
          <YAxis
            type="number"
            dataKey="goalsAgainst"
            name="경기당 실점"
            domain={[0, "dataMax + 0.3" as unknown as number]}
            reversed
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            label={{
              value: "↑ 경기당 실점 (적을수록 위)",
              angle: -90,
              position: "insideLeft",
              offset: 18,
              fontSize: 10,
              fill: "#737373",
            }}
          />
          <ZAxis range={[40, 100]} />
          <ReferenceLine
            x={leagueAvgGF}
            stroke="#a3a3a3"
            strokeDasharray="3 3"
            opacity={0.5}
          />
          <ReferenceLine
            y={leagueAvgGA}
            stroke="#a3a3a3"
            strokeDasharray="3 3"
            opacity={0.5}
          />
          <Tooltip
            cursor={{ stroke: "#a3a3a3", strokeWidth: 1, opacity: 0.4 }}
            contentStyle={{
              background: "rgba(23,23,23,0.92)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 12,
            }}
            formatter={(v: unknown) =>
              typeof v === "number" ? v.toFixed(2) : String(v)
            }
            labelFormatter={() => ""}
            content={({ payload }) => {
              if (!payload || !payload.length) return null;
              const p = payload[0].payload as Point;
              return (
                <div
                  style={{
                    background: "rgba(23,23,23,0.92)",
                    color: "white",
                    fontSize: 12,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {p.name}
                  </div>
                  <div>득점 {p.goalsFor.toFixed(2)} / 경기</div>
                  <div>실점 {p.goalsAgainst.toFixed(2)} / 경기</div>
                </div>
              );
            }}
          />
          <Scatter data={others} fill="#a3a3a3" opacity={0.5} />
          {home && (
            <Scatter
              data={[{ ...home, sz: 200 }]}
              fill="#3b82f6"
              shape={(props: unknown) => {
                const { cx, cy } = props as { cx: number; cy: number };
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={9} fill="#3b82f6" stroke="white" strokeWidth={2} />
                  </g>
                );
              }}
            />
          )}
          {away && (
            <Scatter
              data={[{ ...away, sz: 200 }]}
              fill="#f43f5e"
              shape={(props: unknown) => {
                const { cx, cy } = props as { cx: number; cy: number };
                return (
                  <g>
                    <circle cx={cx} cy={cy} r={9} fill="#f43f5e" stroke="white" strokeWidth={2} />
                  </g>
                );
              }}
            />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
