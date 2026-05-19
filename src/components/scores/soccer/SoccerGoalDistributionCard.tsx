// 시간대별 골 분포 카드 (TheSports analysis.goal_distribution 기반).
// 1-15·16-30·31-45·46-60·61-75·76-90분 6구간, 양 팀 (홈/어웨이) 득점·실점 비교.

interface GoalBucket {
  /** [count, percentage, fromMin, toMin] */
  0: number;
  1: number;
  2: number;
  3: number;
}

interface SideStats {
  matches: number;
  scored: GoalBucket[];
  conceded: GoalBucket[];
}

interface SideData {
  all: SideStats;
  home?: SideStats;
  away?: SideStats;
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  /** analysis.goal_distribution */
  data: { home: SideData; away: SideData };
}

const BUCKETS = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"];

function pickAll(side: SideData | undefined): SideStats | null {
  return side?.all ?? null;
}

function maxBucketCount(...arrays: GoalBucket[][]): number {
  let m = 1;
  for (const arr of arrays) {
    for (const b of arr) m = Math.max(m, b[0]);
  }
  return m;
}

export default function SoccerGoalDistributionCard({ homeNameKo, awayNameKo, data }: Props) {
  const home = pickAll(data?.home);
  const away = pickAll(data?.away);
  if (!home && !away) return null;

  const homeScored = home?.scored ?? [];
  const awayScored = away?.scored ?? [];
  const max = maxBucketCount(homeScored, awayScored);

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">시간대별 득점 분포</h2>
        <span className="text-[11px] text-neutral-500">최근 시즌 기준</span>
      </header>

      {/* 양 팀 헤더 */}
      <div className="flex items-center justify-between text-[12px] sm:text-sm font-semibold mb-2">
        <span className="text-blue-600 dark:text-blue-400 truncate">{homeNameKo}</span>
        <span className="text-neutral-400 text-[10px]">분</span>
        <span className="text-rose-600 dark:text-rose-400 truncate">{awayNameKo}</span>
      </div>

      <div className="space-y-1.5">
        {BUCKETS.map((label, i) => {
          const h = homeScored[i]?.[0] ?? 0;
          const a = awayScored[i]?.[0] ?? 0;
          const hPct = (h / max) * 100;
          const aPct = (a / max) * 100;
          return (
            <div key={label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px] sm:text-xs">
              {/* 홈팀 — 우측 정렬 막대 (좌측이 0, 우측이 max) */}
              <div className="flex items-center justify-end gap-1.5">
                <span className="tabular-nums text-neutral-500 w-4 text-right">{h || ""}</span>
                <div className="flex-1 max-w-[160px] h-3 bg-neutral-100 dark:bg-neutral-900 rounded-sm overflow-hidden flex justify-end">
                  <div
                    className="bg-blue-500 dark:bg-blue-500/80 h-full"
                    style={{ width: `${hPct}%` }}
                  />
                </div>
              </div>
              {/* 시간대 라벨 */}
              <span className="tabular-nums text-neutral-500 text-center w-12">{label}</span>
              {/* 어웨이팀 — 좌측 정렬 막대 */}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 max-w-[160px] h-3 bg-neutral-100 dark:bg-neutral-900 rounded-sm overflow-hidden">
                  <div
                    className="bg-rose-500 dark:bg-rose-500/80 h-full"
                    style={{ width: `${aPct}%` }}
                  />
                </div>
                <span className="tabular-nums text-neutral-500 w-4">{a || ""}</span>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="mt-4 flex justify-between text-[10px] text-neutral-500">
        <span>총 {home?.matches ?? 0}매치</span>
        <span>총 {away?.matches ?? 0}매치</span>
      </footer>
    </section>
  );
}
