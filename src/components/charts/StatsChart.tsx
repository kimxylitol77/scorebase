"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const TOOLTIP_STYLE = { background: "rgba(23,23,23,0.92)", border: "none", borderRadius: 8, color: "white", fontSize: 12 };
const SERIES_LABEL: Record<string, string> = { views: "페이지뷰", visitors: "방문자" };
const fmtSeries = (v: unknown, name: unknown) => [Number(v).toLocaleString(), SERIES_LABEL[String(name)] ?? String(name)] as [string, string];

interface TrafficPoint {
  date: string;
  views: number;
  visitors: number;
}

/** 일별 방문자(선, 초록) + 페이지뷰(면, 파랑). 축 두 개 — PV 가 방문자의 5~6배라 한 축이면 방문자 선이 바닥에 깔린다. */
export function DailyTraffic({ data, tickEvery = 4 }: { data: TrafficPoint[]; tickEvery?: number }) {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 0, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="trafficPvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} vertical={false} />
          <XAxis dataKey="date" stroke="#737373" fontSize={11} tick={{ fill: "currentColor" }} interval={tickEvery} />
          <YAxis yAxisId="pv" stroke="#3b82f6" fontSize={11} tick={{ fill: "currentColor" }} allowDecimals={false} />
          <YAxis yAxisId="uv" orientation="right" stroke="#10b981" fontSize={11} tick={{ fill: "currentColor" }} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={fmtSeries} />
          <Legend formatter={(v: string) => SERIES_LABEL[v] ?? v} wrapperStyle={{ fontSize: 12 }} />
          <Area yAxisId="pv" type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={1.5} fill="url(#trafficPvGrad)" isAnimationActive={false} />
          <Line yAxisId="uv" type="monotone" dataKey="visitors" stroke="#10b981" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HourlyTrafficPoint {
  hour: string;
  views: number;
  visitors: number;
}

/** 시간대별 페이지뷰(막대) + 방문자(선). */
export function HourlyTraffic({ data }: { data: HourlyTrafficPoint[] }) {
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 0, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} vertical={false} />
          <XAxis dataKey="hour" stroke="#737373" fontSize={10} tick={{ fill: "currentColor" }} interval={1} />
          <YAxis yAxisId="pv" stroke="#3b82f6" fontSize={11} tick={{ fill: "currentColor" }} allowDecimals={false} />
          <YAxis yAxisId="uv" orientation="right" stroke="#10b981" fontSize={11} tick={{ fill: "currentColor" }} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(115,115,115,0.08)" }} contentStyle={TOOLTIP_STYLE} formatter={fmtSeries} labelFormatter={(h: unknown) => `${h}시`} />
          <Bar yAxisId="pv" dataKey="views" fill="#3b82f6" fillOpacity={0.75} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="uv" type="monotone" dataKey="visitors" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

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
