// 컵 대회 직전 맞대결 + 두 경기 합계 카드.
// 판정은 lib/predict/previous-leg.ts 가 단일 출처. 여기는 표시만 한다.

import type { PreviousLeg } from "@/lib/predict/previous-leg";
import { kstDateLabel } from "@/lib/analysis/format";

export default function PreviousLegCard({
  leg,
  thisHome,
  thisAway,
  homeNameKo,
  awayNameKo,
}: {
  leg: PreviousLeg;
  thisHome: number;
  thisAway: number;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const level = leg.aggHome === leg.aggAway;
  return (
    <div className="rounded-[28px] bg-neutral-100/70 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl p-5 sm:p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          두 경기 합계
        </h3>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {leg.daysBetween}일 전 맞대결 포함
        </span>
      </div>

      <div className="space-y-2">
        <LegRow
          label={`${kstDateLabel(leg.playedAt)} · ${awayNameKo} 홈`}
          home={leg.homeGoals}
          away={leg.awayGoals}
        />
        <LegRow label="이 경기" home={thisHome} away={thisAway} highlight />
        <div className="h-px bg-neutral-300/70 dark:bg-white/10" />
        <LegRow label="합계" home={leg.aggHome} away={leg.aggAway} bold />
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
        <span className="text-blue-600 dark:text-blue-400">{homeNameKo}</span>
        <span className="text-rose-600 dark:text-rose-400">{awayNameKo}</span>
      </div>

      <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] px-4 py-3 text-[12px] font-semibold text-neutral-700 dark:text-neutral-200">
        {level
          ? "두 경기 합계 동점"
          : leg.aggHome > leg.aggAway
            ? `두 경기 합계 ${homeNameKo} ${leg.aggHome}-${leg.aggAway} 우위`
            : `두 경기 합계 ${awayNameKo} ${leg.aggAway}-${leg.aggHome} 우위`}
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        같은 대회에서 홈·원정을 바꿔 치른 직전 맞대결을 더한 값이다. 연장까지 포함하고
        승부차기는 빼고 셌다. 대회 단계 정보가 없어 1·2차전인지까지는 판정하지 않는다.
      </p>
    </div>
  );
}

function LegRow({
  label,
  home,
  away,
  highlight,
  bold,
}: {
  label: string;
  home: number;
  away: number;
  highlight?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
        highlight ? "bg-white/70 dark:bg-white/[0.06]" : ""
      }`}
    >
      <span className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</span>
      <span
        className={`tabular-nums ${
          bold
            ? "text-[15px] font-bold text-neutral-900 dark:text-neutral-50"
            : "text-[13px] font-semibold text-neutral-700 dark:text-neutral-200"
        }`}
      >
        {home} : {away}
      </span>
    </div>
  );
}
