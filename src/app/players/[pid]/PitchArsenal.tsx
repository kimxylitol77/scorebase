// 투수 구종 arsenal — 구종별 구사율 막대 + 평균 구속. statsapi pitchArsenal 기반.

import type { ArsenalPitch } from "@/lib/sports/mlb-player-extras";

// 구종별 색 — 패스트볼 계열 빨강, 변화구 파랑/보라 계열.
const PITCH_COLOR: Record<string, string> = {
  FF: "bg-red-500",
  FT: "bg-orange-500",
  SI: "bg-amber-500",
  FC: "bg-rose-500",
  SL: "bg-sky-500",
  ST: "bg-cyan-500",
  SV: "bg-teal-500",
  CU: "bg-blue-500",
  KC: "bg-indigo-500",
  CS: "bg-blue-400",
  CH: "bg-violet-500",
  FS: "bg-purple-500",
  FO: "bg-fuchsia-500",
  KN: "bg-emerald-500",
};

export default function PitchArsenal({
  pitches,
  title = "구종 구성",
}: {
  pitches: ArsenalPitch[];
  /** 한 화면에 투수 둘을 나란히 놓을 때(PREVIEW 글) 누구 것인지 구분하려면 이름을 넘긴다. */
  title?: string;
}) {
  if (pitches.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex items-baseline justify-between mb-3.5 flex-wrap gap-x-2">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        <span className="text-xs text-neutral-400">구사율 · 평균 구속</span>
      </div>
      <div className="space-y-2.5">
        {pitches.map((p) => (
          <div key={p.code} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-semibold">{p.name}</span>
            <div className="flex-1 h-5 rounded-md bg-neutral-100 dark:bg-neutral-800 relative overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 ${PITCH_COLOR[p.code] ?? "bg-neutral-500"} opacity-85`}
                style={{ width: `${Math.max(p.usage, 2)}%` }}
              />
              <span className="absolute inset-y-0 left-2 flex items-center text-[11px] font-bold text-neutral-700 dark:text-neutral-100">
                {p.usage}%
              </span>
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-500">
              {p.mph > 0 ? `${p.mph} mph` : "—"}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-neutral-400 mt-3">출처: MLB Stats API (Statcast 구종 분류)</p>
    </section>
  );
}
