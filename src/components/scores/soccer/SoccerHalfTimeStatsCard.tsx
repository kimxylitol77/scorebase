// 축구 전반/후반 통계 비교 — TheSports /v1/football/match/half/team_stats/list 응답.
// 응답 구조: { ft: { stat_type_id: [home, away] }, p1: {...}, p2: {...} }
// p1 = 전반, p2 = 후반, ft = 풀타임 누적

const STAT_LABELS: Record<number, string> = {
  2: "슈팅",
  3: "오프사이드",
  4: "코너킥",
  8: "옐로카드",
  9: "레드카드",
  21: "유효 슈팅",
  22: "위협적 공격",
  23: "공격",
  24: "공격 (전체)",
  25: "점유율 (%)",
  37: "패스 성공률 (%)",
};

// 표시 우선순위 (위→아래)
const STAT_ORDER = [25, 2, 21, 22, 4, 3, 8, 9, 23, 24, 37];

interface PhaseStats {
  [statId: string]: [number, number] | undefined;
}

interface Props {
  halfTeamStats: {
    ft?: PhaseStats | null;
    p1?: PhaseStats | null;
    p2?: PhaseStats | null;
  };
  homeNameKo: string;
  awayNameKo: string;
}

function PhaseColumn({
  label,
  stats,
  highlight,
}: {
  label: string;
  stats: PhaseStats | null | undefined;
  highlight?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div
        className={`text-[10px] font-bold tracking-wider uppercase pb-1 mb-1.5 border-b ${
          highlight
            ? "text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30"
            : "text-neutral-500 border-neutral-200 dark:border-white/10"
        }`}
      >
        {label}
      </div>
      <ul className="space-y-1.5">
        {STAT_ORDER.map((statId) => {
          const v = stats?.[String(statId)];
          if (!v || (v[0] === 0 && v[1] === 0)) return null;
          const [home, away] = v;
          return (
            <li
              key={statId}
              className="grid grid-cols-[2.2rem_1fr_2.2rem] gap-1 items-center text-[11px]"
            >
              <span className="text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
                {home}
              </span>
              <span className="text-center text-[10px] text-neutral-500 truncate">
                {STAT_LABELS[statId]}
              </span>
              <span className="text-left tabular-nums font-bold text-blue-600 dark:text-blue-400">
                {away}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function SoccerHalfTimeStatsCard({
  halfTeamStats,
  homeNameKo,
  awayNameKo,
}: Props) {
  const { ft, p1, p2 } = halfTeamStats;
  const anyPhase = [p1, p2, ft].some((p) => p && Object.keys(p).length > 0);
  if (!anyPhase) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">
          전반·후반 통계 비교
        </h2>
        <span className="text-[11px] text-neutral-500">TheSports half-time stats</span>
      </header>

      {/* 양 팀명 — 한 줄 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-3 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-semibold truncate">
          {homeNameKo}
        </div>
        <div className="text-neutral-500">vs</div>
        <div className="text-left text-blue-600 dark:text-blue-400 font-semibold truncate">
          {awayNameKo}
        </div>
      </div>

      {/* 전반 / 후반 / 풀타임 3 컬럼 */}
      <div className="flex gap-3 sm:gap-5">
        <PhaseColumn label="전반" stats={p1} />
        <PhaseColumn label="후반" stats={p2} />
        <PhaseColumn label="풀타임" stats={ft} highlight />
      </div>
    </section>
  );
}
