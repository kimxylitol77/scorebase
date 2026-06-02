// 야구 라이브 WPA 곡선 — Poisson 모델 기반.
// y=0.5 기준선, 위는 home 우세 (rose), 아래는 away 우세 (sky).

interface WpaPoint {
  inning: number;
  homeWP: number;
  homeScore: number;
  awayScore: number;
}

interface Props {
  series: WpaPoint[];
  homeNameKo: string;
  awayNameKo: string;
}

const W = 600;
const H = 200;
const PAD_X = 30;
const PAD_Y = 16;

export default function BaseballWpaChart({ series, homeNameKo, awayNameKo }: Props) {
  if (series.length < 2) return null;

  const maxInning = Math.max(9, ...series.map((p) => p.inning));
  const xOf = (i: number) => PAD_X + ((W - PAD_X * 2) * i) / maxInning;
  const yOf = (wp: number) => PAD_Y + (H - PAD_Y * 2) * (1 - wp);

  // line path
  const linePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.inning).toFixed(1)},${yOf(p.homeWP).toFixed(1)}`)
    .join(" ");

  // area above 0.5 (home advantage) — clip to 0.5 line
  const homeAreaPath =
    `M${xOf(series[0].inning).toFixed(1)},${yOf(0.5).toFixed(1)} ` +
    series
      .map((p) => {
        const y = yOf(Math.max(0.5, p.homeWP));
        return `L${xOf(p.inning).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") +
    ` L${xOf(series[series.length - 1].inning).toFixed(1)},${yOf(0.5).toFixed(1)} Z`;

  const awayAreaPath =
    `M${xOf(series[0].inning).toFixed(1)},${yOf(0.5).toFixed(1)} ` +
    series
      .map((p) => {
        const y = yOf(Math.min(0.5, p.homeWP));
        return `L${xOf(p.inning).toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") +
    ` L${xOf(series[series.length - 1].inning).toFixed(1)},${yOf(0.5).toFixed(1)} Z`;

  const last = series[series.length - 1];
  // 확률 상한 캡 — 100%/0% 과신 표기 금지 (명세 4-5).
  const homeWPpct = Math.min(99, Math.max(1, Math.round(last.homeWP * 100)));
  const awayWPpct = 100 - homeWPpct;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          현재 승률 곡선 · 실시간
        </div>
        <div className="text-[10px] text-neutral-400">Poisson · 현재 점수 기준</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* 0.5 기준선 */}
        <line
          x1={PAD_X}
          y1={yOf(0.5)}
          x2={W - PAD_X}
          y2={yOf(0.5)}
          stroke="#94a3b8"
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.5}
        />
        {/* 이닝 grid */}
        {Array.from({ length: maxInning + 1 }, (_, i) => (
          <g key={i}>
            <line
              x1={xOf(i)}
              y1={PAD_Y}
              x2={xOf(i)}
              y2={H - PAD_Y}
              stroke="#e2e8f0"
              strokeWidth={0.5}
              opacity={0.3}
            />
            {i % 1 === 0 && i > 0 && (
              <text
                x={xOf(i)}
                y={H - 2}
                fontSize={9}
                fill="#94a3b8"
                textAnchor="middle"
              >
                {i}
              </text>
            )}
          </g>
        ))}

        {/* 홈 우세 영역 (rose) */}
        <path d={homeAreaPath} fill="#f43f5e" opacity={0.18} />
        {/* 어웨이 우세 영역 (sky) */}
        <path d={awayAreaPath} fill="#0ea5e9" opacity={0.18} />

        {/* 곡선 */}
        <path d={linePath} fill="none" stroke="#475569" strokeWidth={1.5} />

        {/* 점 */}
        {series.map((p, i) => (
          <circle
            key={i}
            cx={xOf(p.inning)}
            cy={yOf(p.homeWP)}
            r={2.5}
            fill={p.homeWP > 0.5 ? "#f43f5e" : p.homeWP < 0.5 ? "#0ea5e9" : "#94a3b8"}
          />
        ))}

        {/* y축 라벨 */}
        <text x={4} y={PAD_Y + 6} fontSize={9} fill="#94a3b8">100%</text>
        <text x={4} y={yOf(0.5) + 3} fontSize={9} fill="#94a3b8">50%</text>
        <text x={4} y={H - PAD_Y} fontSize={9} fill="#94a3b8">0%</text>
      </svg>

      <div className="grid grid-cols-3 gap-2 items-center pt-2 border-t border-neutral-100 dark:border-neutral-800">
        <div className="text-right">
          <div className="text-[10px] text-neutral-500 truncate">{awayNameKo}</div>
          <div className="text-base font-bold text-sky-600 dark:text-sky-400 tabular-nums">{awayWPpct}%</div>
        </div>
        <div className="text-center text-[10px] text-neutral-400">
          {last.inning > 0 ? `${Math.floor(last.inning)}회${last.inning % 1 !== 0 ? " 초" : ""} 시점` : "시작 전"}
        </div>
        <div className="text-left">
          <div className="text-[10px] text-neutral-500 truncate">{homeNameKo}</div>
          <div className="text-base font-bold text-rose-600 dark:text-rose-400 tabular-nums">{homeWPpct}%</div>
        </div>
      </div>
    </div>
  );
}
