// KBO 타자 리그 백분위 섹션 — Savant 비교 툴 스타일의 5개 핵심 스탯 백분위 막대.
// 서버 컴포넌트. 데이터 없으면(규정 미달·표본 부족) 부모에서 렌더 자체를 생략한다.

import type { KboHitterPercentiles } from "@/lib/sports/baseball/kbo-hitter-percentile";
import ShareCardButton from "@/components/ShareCardButton";

// Savant 관례: 상위(높음)=빨강, 하위=파랑, 중간=회색
function barColor(pct: number): string {
  if (pct >= 80) return "bg-rose-600";
  if (pct >= 60) return "bg-rose-400";
  if (pct >= 40) return "bg-zinc-400 dark:bg-zinc-500";
  if (pct >= 20) return "bg-sky-400";
  return "bg-sky-600";
}

export default function KboPercentileSection({
  data,
  shareUrl,
  cardImageUrl,
}: {
  data: KboHitterPercentiles;
  shareUrl: string;
  cardImageUrl: string;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
          {data.season} KBO 리그 백분위
        </h2>
        <ShareCardButton
          url={shareUrl}
          title={`${data.playerName} — ${data.season} KBO 리그 백분위 | Scorebase`}
          text={`${data.playerName}의 KBO 리그 내 위치를 백분위로 확인해 보세요.`}
          cardImageUrl={cardImageUrl}
        />
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-neutral-500">
        규정 표본 {data.sample}명({data.minGames}경기 이상 출장) 기준. 백분위 90 = 리그 상위 10%.
      </p>
      <div className="space-y-3">
        {data.metrics.map((m) => (
          <div key={m.key} className="flex items-center gap-3">
            <div className="w-12 shrink-0 text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              {m.label}
            </div>
            <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/[0.06]">
              <div
                className={`h-full rounded-full ${barColor(m.pct)}`}
                style={{ width: `${Math.max(m.pct, 3)}%` }}
              />
            </div>
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${barColor(m.pct)}`}
              title={`백분위 ${m.pct}`}
            >
              {m.pct}
            </div>
            <div className="w-14 shrink-0 text-right text-sm font-bold tabular-nums">
              {m.display}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
