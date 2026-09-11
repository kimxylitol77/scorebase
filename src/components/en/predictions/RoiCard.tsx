// RoiCard (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { fmtRoiPct, fmtUnits } from "@/lib/predict/flat-roi";

export interface RoiCardWindow {
  evaluated: number;
  wins: number;
  units: number;
  roi: number;
}

export default function RoiCard({
  label,
  sub,
  w,
  hitNoun = "W",
  sampleNoun = " matches",
  excludedNote,
}: {
  label: string;
  sub?: string;
  w: RoiCardWindow;
  /** "승"(모델·시장) / "적중"(회원 픽) */
  hitNoun?: string;
  /** "경기" / "표" */
  sampleNoun?: string;
  /** "배당 없음 N건 제외" 같은 표본 주석 — 있으면 한 줄 더 */
  excludedNote?: string;
}) {
  return (
    <div className="rounded-xl bg-neutral-50 dark:bg-white/[0.04] p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      {sub && <p className="text-[10px] text-neutral-400 mt-0.5 mb-2">{sub}</p>}
      <div
        className={`text-2xl font-bold tabular-nums ${
          w.roi >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"
        }`}
      >
        {fmtRoiPct(w.roi)}
      </div>
      <p className="text-[11px] text-neutral-500 tabular-nums mt-1">
        {fmtUnits(w.units)} · {w.wins.toLocaleString()}{hitNoun} / {w.evaluated.toLocaleString()}{sampleNoun}
      </p>
      {excludedNote && <p className="text-[11px] text-neutral-400 mt-0.5">{excludedNote}</p>}
    </div>
  );
}
