"use client";

// 예측 확률 정직도(캘리브레이션 곡선) — x=예측확률, y=실제발생률.
// 점이 대각선에 붙을수록 확률이 정직. 스코어베이스 vs 베팅시장 + 완벽보정 대각선. 점 크기 = 표본 수.

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export interface RelPoint {
  x: number; // 평균 예측 확률(%)
  y: number; // 실제 발생률(%)
  n: number; // 구간 표본 수
  size: number; // sqrt(n) — 점 크기 매핑용
}

interface Props {
  model: RelPoint[];
  market: RelPoint[];
  modelBrier: number;
  marketBrier: number;
}

const MODEL_COLOR = "#e0533a"; // 스코어베이스
const MARKET_COLOR = "#3b82f6"; // 베팅시장

function RelTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RelPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow dark:border-neutral-700 dark:bg-neutral-900">
      <div>
        예측 {p.x.toFixed(0)}% → 실제 {p.y.toFixed(0)}%
      </div>
      <div className="text-neutral-500">{p.n.toLocaleString()}개 예측</div>
    </div>
  );
}

export default function ReliabilityCurveChart({ model, market, modelBrier, marketBrier }: Props) {
  return (
    <div>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" opacity={0.4} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="#737373"
              fontSize={11}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "currentColor" }}
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              stroke="#737373"
              fontSize={11}
              tickFormatter={(v: number) => `${v}%`}
              tick={{ fill: "currentColor" }}
            />
            <ZAxis type="number" dataKey="size" range={[40, 500]} />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: 100, y: 100 },
              ]}
              stroke="#a3a3a3"
              strokeDasharray="5 4"
            />
            <Tooltip content={<RelTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <Scatter
              name="스코어베이스"
              data={model}
              fill={MODEL_COLOR}
              line={{ stroke: MODEL_COLOR, strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Scatter
              name="베팅시장"
              data={market}
              fill={MARKET_COLOR}
              line={{ stroke: MARKET_COLOR, strokeWidth: 2, strokeDasharray: "6 4" }}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MODEL_COLOR }} />
          <span className="font-medium">스코어베이스</span>
          <span className="tabular-nums text-neutral-500">Brier {modelBrier.toFixed(3)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MARKET_COLOR }} />
          <span className="font-medium">베팅시장</span>
          <span className="tabular-nums text-neutral-500">Brier {marketBrier.toFixed(3)}</span>
        </span>
        <span className="flex items-center gap-1.5 text-neutral-500">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-neutral-400" />
          완벽 보정
        </span>
        <span className="text-neutral-400">점 크기 = 표본 수</span>
      </div>
      <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
        x축 = 모델이 부여한 예측 확률 · y축 = 그 확률대에서 실제로 일어난 비율. 점이 대각선에
        가까울수록 확률이 정직하며, 대각선보다 아래면 그만큼 자신감이 과했다는 의미입니다. Brier 점수는
        낮을수록 정확합니다.
      </p>
    </div>
  );
}
