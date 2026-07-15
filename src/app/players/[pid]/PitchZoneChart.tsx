// MLB 투수 투구 로케이션 존 히트맵 — plate_x/plate_z 산점도, 구종별 색 (포수 시점).
// 스트라이크존(x ±0.83ft, z 1.5~3.5ft) 사각형 위에 투구를 점으로.

import type { PitchLoc } from "@/lib/sports/mlb-player-extras";

// 구종군별 색 — 계열 묶음(포심/싱커/커터/슬라이더/커브/체인지업).
const PITCH_COLOR: Record<string, string> = {
  FF: "#ef4444",
  SI: "#f97316",
  FT: "#f97316",
  FC: "#a855f7",
  SL: "#eab308",
  ST: "#eab308",
  SV: "#eab308",
  CU: "#3b82f6",
  KC: "#3b82f6",
  CS: "#3b82f6",
  CH: "#10b981",
  FS: "#10b981",
  FO: "#10b981",
};
const PITCH_KO: Record<string, string> = {
  FF: "포심",
  SI: "싱커",
  FT: "투심",
  FC: "커터",
  SL: "슬라이더",
  ST: "스위퍼",
  SV: "슬러브",
  CU: "커브",
  KC: "너클커브",
  CS: "슬로우커브",
  CH: "체인지업",
  FS: "스플리터",
  FO: "포크볼",
  KN: "너클볼",
};
const colorOf = (code: string): string => PITCH_COLOR[code] ?? "#94a3b8";

// plate 좌표(ft) → SVG. x: -2.5~2.5 → 0~200, z: 0~5 → 210~10(위).
const toX = (px: number) => (px + 2.5) * 40;
const toZ = (pz: number) => 210 - pz * 40;

export default function PitchZoneChart({
  pitches,
  season,
}: {
  pitches: PitchLoc[];
  season: number;
}) {
  if (pitches.length < 20) return null;
  const byType = new Map<string, number>();
  for (const p of pitches) byType.set(p.code, (byType.get(p.code) ?? 0) + 1);
  const legend = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-x-2">
        <h2 className="text-base font-bold tracking-tight">
          <span className="bg-gradient-to-r from-blue-500 to-rose-500 bg-clip-text text-transparent">
            투구 로케이션
          </span>
        </h2>
        <span className="text-xs text-neutral-400">{season} · 포수 시점 {pitches.length}구</span>
      </div>
      <div className="mx-auto max-w-[260px]">
        <svg viewBox="0 0 200 220" className="w-full" role="img" aria-label="투구 로케이션 존 히트맵">
          {/* 스트라이크존 */}
          <rect
            x={toX(-0.83)}
            y={toZ(3.5)}
            width={toX(0.83) - toX(-0.83)}
            height={toZ(1.5) - toZ(3.5)}
            fill="rgba(148,163,184,0.08)"
            stroke="rgba(148,163,184,0.5)"
            strokeWidth={1}
          />
          {/* 존 3x3 보조선 */}
          {[1, 2].map((i) => {
            const gx = toX(-0.83) + ((toX(0.83) - toX(-0.83)) / 3) * i;
            const gy = toZ(3.5) + ((toZ(1.5) - toZ(3.5)) / 3) * i;
            return (
              <g key={i} stroke="rgba(148,163,184,0.25)" strokeWidth={0.5}>
                <line x1={gx} y1={toZ(3.5)} x2={gx} y2={toZ(1.5)} />
                <line x1={toX(-0.83)} y1={gy} x2={toX(0.83)} y2={gy} />
              </g>
            );
          })}
          {/* 투구 점 */}
          {pitches.map((p, i) => (
            <circle key={i} cx={toX(p.px)} cy={toZ(p.pz)} r={1.5} fill={colorOf(p.code)} opacity={0.3} />
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2 text-[11px] text-neutral-500">
        {legend.map(([code, n]) => (
          <span key={code} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(code) }} />
            {PITCH_KO[code] ?? code} {n}
          </span>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400 mt-2 text-center">
        출처: Baseball Savant (Statcast) · 포수가 보는 스트라이크존
      </p>
    </section>
  );
}
