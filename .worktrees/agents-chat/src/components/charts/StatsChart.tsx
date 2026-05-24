"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyPoint {
  date: string;
  views: number;
}

export function DailyArea({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 5, right: 10, bottom: 0, left: -20 }}
        >
          <defs>
            <linearGradient id="pvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#e5e5e5"
            opacity={0.4}
          />
          <XAxis
            dataKey="date"
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(23,23,23,0.92)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#pvGrad)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HourlyPoint {
  hour: string; // "00", "01", ... "23"
  views: number;
}

export function HourlyBar({ data }: { data: HourlyPoint[] }) {
  return (
    <div className="h-[180px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis
            dataKey="hour"
            stroke="#737373"
            fontSize={10}
            tick={{ fill: "currentColor" }}
            interval={1}
          />
          <YAxis
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            allowDecimals={false}
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
            labelFormatter={(h: unknown) => `${h}시`}
          />
          <Bar dataKey="views" fill="#3b82f6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TrendPoint {
  date: string;
  views: number;
}

export function TrendLine({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
          <XAxis
            dataKey="date"
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
          />
          <YAxis
            stroke="#737373"
            fontSize={11}
            tick={{ fill: "currentColor" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(23,23,23,0.92)",
              border: "none",
              borderRadius: 8,
              color: "white",
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="views"
            stroke="#10b981"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#10b981" }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
