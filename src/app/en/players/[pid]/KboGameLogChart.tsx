// KboGameLogChart (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// KBO 경기별 성적 추이 — 투수=자책점/누적 ERA, 타자=안타/누적 타율.
// 데이터는 KBO 공식 Daily.aspx 의 누적 컬럼(ERA2·AVG2)을 그대로 쓴다.

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { KboPitcherDailyGame, KboHitterDailyGame } from "@/lib/sports/kbo-official";

interface Point {
  label: string;
  상대: string;
  bar: number;
  line: number | undefined;
}

function GameLogChart({
  data,
  title,
  hint,
  barName,
  lineName,
  lineColor,
  lineFormat,
}: {
  data: Point[];
  title: string;
  hint: string;
  barName: string;
  lineName: string;
  lineColor: string;
  lineFormat?: (v: number) => string;
}) {
  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="px-5 pt-4 pb-1">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-neutral-400">{hint}</p>
      </div>
      <div className="h-[260px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 8, bottom: 8, left: -22 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
            <XAxis
              dataKey="label"
              interval="preserveStartEnd"
              minTickGap={18}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "rgba(148,163,184,0.3)" }}
            />
            <YAxis
              yAxisId="bar"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="line"
              orientation="right"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={lineFormat}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                fontSize: 12,
              }}
              formatter={(v, name) =>
                name === lineName && lineFormat && typeof v === "number" ? lineFormat(v) : v
              }
              labelFormatter={(l, payload) => {
                const opp = payload?.[0]?.payload?.상대;
                return opp ? `${l} vs ${opp}` : String(l);
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
            <Bar yAxisId="bar" dataKey="bar" name={barName} fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Line
              yAxisId="line"
              type="monotone"
              dataKey="line"
              name={lineName}
              stroke={lineColor}
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function KboPitcherGameLogChart({ games }: { games: KboPitcherDailyGame[] }) {
  const data = games
    .filter((g) => g.cumEra != null)
    .map((g) => ({ label: g.date, 상대: g.opponent, bar: g.er ?? 0, line: g.cumEra }));
  // 등판 2회 이하면 "추이"가 아니라 점 두 개 — 표만으로 충분하다.
  if (data.length < 3) return null;
  return (
    <GameLogChart
      data={data}
      title="ERA by game"
      hint="Bars = earned runs in that game · line = season ERA to that point"
      barName="ER"
      lineName="Cumulative ERA"
      lineColor="#f43f5e"
    />
  );
}

// 타율은 야구 관례상 앞자리 0 을 생략한다 (.312)
const fmtAvg = (v: number): string => v.toFixed(3).replace(/^0/, "");

export function KboHitterGameLogChart({ games }: { games: KboHitterDailyGame[] }) {
  const data = games
    .filter((g) => g.cumAvg != null)
    .map((g) => ({ label: g.date, 상대: g.opponent, bar: g.h ?? 0, line: g.cumAvg }));
  if (data.length < 3) return null;
  return (
    <GameLogChart
      data={data}
      title="AVG by game"
      hint="Bars = hits in that game · line = season AVG to that point"
      barName="H"
      lineName="Cumulative AVG"
      lineColor="#3b82f6"
      lineFormat={fmtAvg}
    />
  );
}
