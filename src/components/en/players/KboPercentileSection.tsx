// KboPercentileSection (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import ShareCardButton from "@/components/en/ShareCardButton";

export type PercentileSectionData = {
  league: string;
  playerName: string;
  teamName: string;
  season: string;
  sample: number;
  metrics: { key: string; label: string; display: string; pct: number }[];
} & ({ minGames: number } | { minIp: number });

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
  data: PercentileSectionData;
  shareUrl?: string;
  cardImageUrl?: string;
}) {
  // 규정 문구 — 타자·스케이터는 출장 경기, 투수는 이닝 기준
  const qualifier =
    "minGames" in data ? `${data.minGames}games or more` : `${data.minIp}innings or more`;
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500">
          {data.season} {data.league} League percentile
        </h2>
        {shareUrl && cardImageUrl && (
          <ShareCardButton
            url={shareUrl}
            title={`${data.playerName} — ${data.season} ${data.league} league percentiles | Scorebase`}
            text={`${data.playerName}'s ${data.league} See where they sit in the league, by percentile.`}
            cardImageUrl={cardImageUrl}
          />
        )}
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-neutral-500">
        Qualified sample {data.sample}players ({qualifier}. Percentile 90 = top 10% of the league.
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
              title={`Percentile ${m.pct}`}
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
