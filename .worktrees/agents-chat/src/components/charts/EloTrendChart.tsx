"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";

interface Series {
  name: string;
  color: string;
  points: Array<{ index: number; date: string; rating: number }>;
}

interface Props {
  homeSeries: Series;
  awaySeries: Series;
}

export default function EloTrendChart({ homeSeries, awaySeries }: Props) {
  // 두 시리즈를 매치 인덱스(라운드 가까이) 기준으로 합쳐 X 축 통일
  const maxLen = Math.max(homeSeries.points.length, awaySeries.points.length);
  const data = Array.from({ length: maxLen }, (_, i) => ({
    round: i + 1,
    [homeSeries.name]: homeSeries.points[i]?.rating,
    [awaySeries.name]: awaySeries.points[i]?.rating,
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 5, right: 10, bottom: 0, left: -20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis
            dataKey="round"
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            label={{
              value: "라운드",
              position: "insideBottom",
              offset: -5,
              fontSize: 10,
              fill: "#737373",
            }}
          />
          <YAxis
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            domain={[
              "dataMin - 30" as unknown as number,
              "dataMax + 30" as unknown as number,
            ]}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(23,23,23,0.92)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 12,
            }}
            formatter={(v: unknown) =>
              typeof v === "number" ? Math.round(v) : (v as string)
            }
            labelFormatter={(round: unknown) => `${round}라운드`}
          />
          <ReferenceLine
            y={1500}
            stroke="#a3a3a3"
            strokeDasharray="4 4"
            label={{
              value: "기준 1500",
              position: "right",
              fontSize: 9,
              fill: "#a3a3a3",
            }}
          />
          <Line
            type="monotone"
            dataKey={homeSeries.name}
            stroke={homeSeries.color}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey={awaySeries.name}
            stroke={awaySeries.color}
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="line"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
