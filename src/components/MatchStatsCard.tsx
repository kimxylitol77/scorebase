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

/** 기대득점(xG) — af fixtureStats. 종료 경기 + 실제 스코어와 함께 "운 좋은 승리" 등 인사이트 생성. */
interface MatchXg {
  home: number;
  away: number;
  homeScore: number | null;
  awayScore: number | null;
}

/** xG vs 실제 결과의 어긋남을 한국어 인사이트 한 줄로. 평범한 경기는 null(코멘트 생략). */
function xgInsight(xg: MatchXg, homeName: string, awayName: string): string | null {
  const { home, away, homeScore, awayScore } = xg;
  if (homeScore == null || awayScore == null) return null;
  const xgDiff = home - away;
  const realDiff = homeScore - awayScore;
  const xgWinnerHome = xgDiff > 0;
  const realWinnerHome = realDiff > 0;
  // xG 의미있는 차이만(0.5+). 무승부인데 xG 한쪽 우세 → 아쉬운 무승부.
  if (Math.abs(xgDiff) >= 0.5 && realDiff === 0) {
    return `${xgWinnerHome ? homeName : awayName}, 기대득점은 앞섰지만 무승부 — 결정력이 아쉬웠습니다.`;
  }
  // 실제 승자 ≠ xG 우세팀 → 운 좋은 승리.
  if (Math.abs(xgDiff) >= 0.5 && realDiff !== 0 && xgWinnerHome !== realWinnerHome) {
    return `🍀 ${realWinnerHome ? homeName : awayName}, 기대득점 열세를 딛고 거둔 값진 승리입니다.`;
  }
  // 실제·xG 모두 압도 → 완승.
  if (Math.abs(xgDiff) >= 0.8 && realDiff !== 0 && xgWinnerHome === realWinnerHome) {
    return `${realWinnerHome ? homeName : awayName}, 기대득점·결과 모두 앞선 완승입니다.`;
  }
  return null;
}

export default function MatchStatsCard({
  stats,
  homeName,
  awayName,
  xg,
}: {
  stats: MatchStatsRow;
  homeName: string;
  awayName: string;
  xg?: MatchXg | null;
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
      {xg && (() => {
        const max = Math.max(xg.home, xg.away, 0.1);
        const insight = xgInsight(xg, homeName, awayName);
        return (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              기대 득점 (xG)
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-right text-2xl font-extrabold tabular-nums text-blue-600 dark:text-blue-400">
                {xg.home.toFixed(2)}
              </div>
              <div className="px-1 text-[10px] font-medium text-neutral-400">xG</div>
              <div className="text-2xl font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
                {xg.away.toFixed(2)}
              </div>
            </div>
            <div className="mt-1.5 flex h-1.5 items-center gap-1">
              <div className="flex flex-1 justify-end">
                <div className="h-full rounded-l bg-blue-500" style={{ width: `${(xg.home / max) * 100}%` }} />
              </div>
              <div className="h-3 w-px bg-neutral-300 dark:bg-neutral-700" />
              <div className="flex-1">
                <div className="h-full rounded-r bg-rose-500" style={{ width: `${(xg.away / max) * 100}%` }} />
              </div>
            </div>
            {insight && (
              <p className="mt-2 text-center text-[11px] font-medium leading-relaxed text-emerald-800 dark:text-emerald-300">
                {insight}
              </p>
            )}
          </div>
        );
      })()}
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
