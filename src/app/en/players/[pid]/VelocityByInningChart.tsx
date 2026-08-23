// VelocityByInningChart (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// 투수 이닝별 평균 구속 꺾은선 — 피로 지수 대리 지표. 주무기 속구 하나만 집계한다
// (전 구종 평균은 후반 변화구 비중 변화가 구속 하락처럼 보이게 만든다).

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { PitcherVelocityTrend } from "@/lib/sports/mlb-player-extras";

export default function VelocityByInningChart({
  trend,
  season,
}: {
  trend: PitcherVelocityTrend;
  season: number;
}) {
  const data = trend.byInning.map((r) => ({
    inning: `${r.inning}`,
    mph: r.mph,
    pitches: r.pitches,
  }));
  const speeds = trend.byInning.map((r) => r.mph);
  // y축 여유 0.5mph 를 0.5 단위로 올림/내림. 1mph 씩 잡으면 축이 4mph 로 벌어져
  // 1mph 안팎인 실제 낙폭이 평평한 직선으로 보인다(축 눈금은 실제 값 그대로라 과장 아님).
  const half = (v: number, fn: (x: number) => number) => fn(v * 2) / 2;
  const lo = half(Math.min(...speeds) - 0.5, Math.floor);
  const hi = half(Math.max(...speeds) + 0.5, Math.ceil);
  // 눈금은 직접 만든다 — recharts 자동 분할은 96.15·97.45 같은 값을 내고, 그 5자리 라벨이
  // 모바일(폭 342px)에서 y축 밖으로 잘려나갔다. 폭이 넓어지면 간격을 키워 눈금 수를 묶는다.
  const step = hi - lo <= 3 ? 0.5 : hi - lo <= 6 ? 1 : 2;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(1)));
  const total = trend.byInning.reduce((s, r) => s + r.pitches, 0);

  return (
    <section className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="px-5 pt-4 pb-1">
        <div className="flex items-baseline justify-between flex-wrap gap-x-2">
          <h2 className="text-base font-bold tracking-tight">Velocity by inning</h2>
          <span className="text-xs text-neutral-400">
            {season} · {trend.pitchLabel} {total.toLocaleString()} pitches
          </span>
        </div>
        <p className="text-xs text-neutral-400">
          Whether the ball slows as the game goes on — an indirect read on fatigue
        </p>
      </div>
      <div className="h-[240px] px-2 pb-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 18, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-neutral-200 dark:text-white/10" />
            <XAxis dataKey="inning" tick={{ fontSize: 11 }} stroke="currentColor" className="text-neutral-400" />
            <YAxis
              domain={[lo, hi]}
              ticks={ticks}
              tick={{ fontSize: 11 }}
              stroke="currentColor"
              className="text-neutral-400"
              width={40}
              tickFormatter={(v: number) => `${v}`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "none",
                fontSize: 12,
                boxShadow: "0 10px 30px -12px rgba(0,0,0,0.35)",
              }}
              formatter={(v, _n, item) => [
                `${v} mph · ${(item?.payload as { pitches: number } | undefined)?.pitches ?? 0} pitches`,
                trend.pitchLabel,
              ]}
            />
            {/* 애니메이션 끔 — 이 차트는 Suspense 로 늦게 마운트돼서, 탭이 백그라운드면
                recharts 의 draw-in 이 첫 프레임을 못 받고 stroke-dasharray 0 에서 굳는다
                (실측: 선이 통째로 안 보임). 7점짜리 정적 선이라 애니메이션 이득도 없다. */}
            <Line
              type="monotone"
              dataKey="mph"
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={{ r: 3.5 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="px-5 pb-4">
        <p className="text-sm">
          {trend.drop > 0 ? (
            <>
              <span className="font-semibold">{trend.byInning[0].inning} {trend.byInning[0].mph} mph</span>
              {" → "}
              <span className="font-semibold">{trend.dropInning} {trend.byInning.find((r) => r.inning === trend.dropInning)!.mph} mph</span>
              {" · "}
              <span className="font-bold text-red-600 dark:text-red-400 tabular-nums">
                -{trend.drop.toFixed(1)} mph
              </span>
            </>
          ) : (
            <span className="font-semibold">Velocity held up into the later innings.</span>
          )}
        </p>
        <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
          Source: Baseball Savant (Statcast) · innings with fewer than 15 pitches are excluded as too small a sample.
          To avoid an illusion caused by a shifting pitch mix, only the primary pitch {trend.pitchLabel} is counted.
          A drop in velocity can signal fatigue, but pitch strategy, ballpark and temperature move it too.
        </p>
      </div>
    </section>
  );
}
