// 경기 전 체크포인트 — 홈/원정 각각의 유리·불리 요인 카드.
// 판정은 lib/predict/match-factors.ts 가 단일 출처. 여기는 표시만 한다.

import type { MatchFactors } from "@/lib/predict/match-factors";

export default function MatchFactorsCard({
  factors,
  homeNameKo,
  awayNameKo,
}: {
  factors: MatchFactors;
  homeNameKo: string;
  awayNameKo: string;
}) {
  return (
    <div className="rounded-[28px] bg-neutral-100/70 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl p-5 sm:p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-100">
          경기 전 체크포인트
        </h3>
        <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
          최근 기록에서 자동 추출
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SideColumn name={homeNameKo} sideLabel="홈" items={factors.home} />
        <SideColumn name={awayNameKo} sideLabel="원정" items={factors.away} />
      </div>

      <p className="text-[10px] leading-relaxed text-neutral-400 dark:text-neutral-500">
        리그 경기 기록에서 기준을 넘은 항목만 자동으로 골라낸 것이며, 승패를 예측하는 값이
        아니다. 해당 없는 팀은 항목이 비어 있다.
      </p>
    </div>
  );
}

function SideColumn({
  name,
  sideLabel,
  items,
}: {
  name: string;
  sideLabel: string;
  items: MatchFactors["home"];
}) {
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/[0.06] p-3.5 space-y-2.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-[13px] font-bold text-neutral-900 dark:text-neutral-50">{name}</span>
        <span className="text-[10px] text-neutral-500 dark:text-neutral-400">{sideLabel}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
          기준을 넘은 항목이 없다
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span
                className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                  f.tone === "good" ? "bg-emerald-500" : "bg-rose-500"
                }`}
              />
              <span className="text-[12px] leading-relaxed text-neutral-700 dark:text-neutral-200">
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
