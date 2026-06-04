// 실제 경기 기록 (코너·슈팅·유효슈팅·점유율·카드) — MatchStats 캡처/백필 데이터.
// 예측이 아니라 "실제로 일어난 사실". 종료된 축구 경기에만 표시.

interface MatchStatsRow {
  homeCorners: number | null;
  awayCorners: number | null;
  homeShots: number | null;
  awayShots: number | null;
  homeShotsOnTarget: number | null;
  awayShotsOnTarget: number | null;
  homePossession: number | null;
  awayPossession: number | null;
  homeYellow: number | null;
  awayYellow: number | null;
  homeRed: number | null;
  awayRed: number | null;
}

export default function MatchStatsCard({
  stats,
  homeName,
  awayName,
}: {
  stats: MatchStatsRow;
  homeName: string;
  awayName: string;
}) {
  const rows: Array<{ label: string; h: number | null; a: number | null; pct?: boolean }> = [
    { label: "코너킥", h: stats.homeCorners, a: stats.awayCorners },
    { label: "슈팅", h: stats.homeShots, a: stats.awayShots },
    { label: "유효 슈팅", h: stats.homeShotsOnTarget, a: stats.awayShotsOnTarget },
    { label: "점유율", h: stats.homePossession, a: stats.awayPossession, pct: true },
    { label: "옐로카드", h: stats.homeYellow, a: stats.awayYellow },
  ];
  if ((stats.homeRed ?? 0) > 0 || (stats.awayRed ?? 0) > 0) {
    rows.push({ label: "레드카드", h: stats.homeRed, a: stats.awayRed });
  }
  const visible = rows.filter((r) => r.h != null || r.a != null);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-3 py-4 sm:px-5 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="truncate text-sm font-bold text-blue-600 dark:text-blue-400">{homeName}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">경기 기록</div>
        <div className="truncate text-sm font-bold text-rose-600 dark:text-rose-400">{awayName}</div>
      </div>
      <div className="space-y-2.5">
        {visible.map((r) => {
          const h = r.h ?? 0;
          const a = r.a ?? 0;
          const tot = h + a || 1;
          const hPct = (h / tot) * 100;
          const aPct = (a / tot) * 100;
          const hBetter = h > a;
          const aBetter = a > h;
          return (
            <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-end gap-2">
                <span
                  className={`text-sm font-bold tabular-nums ${hBetter ? "text-blue-600 dark:text-blue-400" : "text-neutral-600 dark:text-neutral-300"}`}
                >
                  {r.h ?? "-"}
                  {r.pct ? "%" : ""}
                </span>
                <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100 sm:block dark:bg-neutral-800">
                  <div
                    className={`ml-auto h-full rounded-full ${hBetter ? "bg-blue-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
                    style={{ width: `${hPct}%` }}
                  />
                </div>
              </div>
              <div className="whitespace-nowrap px-1 text-center text-[11px] font-medium text-neutral-500">
                {r.label}
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-neutral-100 sm:block dark:bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${aBetter ? "bg-rose-500" : "bg-neutral-300 dark:bg-neutral-700"}`}
                    style={{ width: `${aPct}%` }}
                  />
                </div>
                <span
                  className={`text-sm font-bold tabular-nums ${aBetter ? "text-rose-600 dark:text-rose-400" : "text-neutral-600 dark:text-neutral-300"}`}
                >
                  {r.a ?? "-"}
                  {r.pct ? "%" : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
        ⓘ 실제 경기 기록 (TheSports · api-football). 예측이 아닌 종료 경기의 사실 통계입니다.
      </p>
    </div>
  );
}
