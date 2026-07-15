// MLB 타자 타구 분포 스프레이차트 — Statcast hc_x/hc_y 좌표를 야구장 위에 점으로 찍는다.
// 좌표계: 홈플레이트=(125.42, 198.27), y 작을수록 외야(위). 배경도 같은 좌표계라 점과 정합.

import type { BattedBall } from "@/lib/sports/mlb-player-extras";

const HX = 125.42;
const HY = 198.27;
const R = 155; // 외야 펜스 반경(hc 단위) — 시각 근사

// 45도 파울선 끝점 (R 반경)
const FOUL = R * Math.SQRT1_2; // ≈ 109.6
const LF = { x: HX - FOUL, y: HY - FOUL }; // 좌측 파울폴
const RF = { x: HX + FOUL, y: HY - FOUL }; // 우측 파울폴

// 내야 베이스 (홈 기준 90ft ≈ 35units, 2루 127ft ≈ 49units)
const B90 = 35 * Math.SQRT1_2;
const B1 = { x: HX + B90, y: HY - B90 };
const B3 = { x: HX - B90, y: HY - B90 };
const B2 = { x: HX, y: HY - 49 };

const COLOR = {
  hr: "#ef4444",
  hit: "#10b981",
  out: "#94a3b8",
} as const;

// out(아래) → hit → hr(위) 순으로 그려 안타·홈런 점이 위로 오게.
const Z = { out: 0, hit: 1, hr: 2 };

export default function SprayChart({ balls, season }: { balls: BattedBall[]; season: number }) {
  if (balls.length < 5) return null;
  const hr = balls.filter((b) => b.result === "hr").length;
  const hit = balls.filter((b) => b.result === "hit").length;
  const out = balls.length - hr - hit;
  const ordered = balls.slice().sort((a, b) => Z[a.result] - Z[b.result]);

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-x-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-emerald-500 to-rose-500 bg-clip-text text-transparent">
            타구 분포
          </span>
        </h2>
        <span className="text-xs text-neutral-400">{season} · 인플레이 {balls.length}타구</span>
      </div>
      <div className="mx-auto max-w-[360px]">
        <svg viewBox="8 34 235 178" className="w-full" role="img" aria-label="타구 분포 스프레이차트">
          {/* 페어그라운드 잔디 */}
          <path
            d={`M ${HX} ${HY} L ${LF.x} ${LF.y} A ${R} ${R} 0 0 1 ${RF.x} ${RF.y} Z`}
            fill="rgba(16,185,129,0.12)"
            stroke="rgba(148,163,184,0.55)"
            strokeWidth={0.7}
          />
          {/* 파울선 */}
          <line x1={HX} y1={HY} x2={LF.x} y2={LF.y} stroke="rgba(148,163,184,0.55)" strokeWidth={0.8} />
          <line x1={HX} y1={HY} x2={RF.x} y2={RF.y} stroke="rgba(148,163,184,0.55)" strokeWidth={0.8} />
          {/* 내야 다이아몬드 */}
          <path
            d={`M ${HX} ${HY} L ${B1.x} ${B1.y} L ${B2.x} ${B2.y} L ${B3.x} ${B3.y} Z`}
            fill="rgba(180,120,70,0.18)"
            stroke="rgba(148,163,184,0.55)"
            strokeWidth={0.7}
          />
          {/* 타구 점 */}
          {ordered.map((b, i) => (
            <circle
              key={i}
              cx={b.x}
              cy={b.y}
              r={b.result === "hr" ? 2.4 : b.result === "hit" ? 2 : 1.6}
              fill={COLOR[b.result]}
              opacity={b.result === "out" ? 0.5 : 0.9}
            />
          ))}
        </svg>
      </div>
      <div className="flex items-center justify-center gap-4 mt-2 text-[11px] text-neutral-500">
        <Legend color={COLOR.hr} label={`홈런 ${hr}`} />
        <Legend color={COLOR.hit} label={`안타 ${hit}`} />
        <Legend color={COLOR.out} label={`아웃 ${out}`} />
      </div>
      <p className="text-[11px] text-neutral-400 mt-2 text-center">
        출처: Baseball Savant (Statcast) · 인플레이 타구 낙구 지점
      </p>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
