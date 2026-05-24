// 축구 LIVE 통계 비교 — TheSports detail_live.stats 응답.
// 응답 stats: [{ type: int, home: number, away: number }]
// type 코드 의미 추정 (공식 status codes 문서 미확보):
//   25 = 점유율(%), 2 = 슛 총, 21 = 유효슛, 4 = 코너킥, 22 = 위협적인 공격, 8 = 옐로카드
// 다른 type 은 "기타" 로 표시.

// type → 한국어 라벨 (추정)
const STAT_LABELS: Record<number, string> = {
  25: "점유율 (%)",
  2: "슈팅",
  21: "유효 슈팅",
  4: "코너킥",
  22: "위협적 공격",
  23: "공격",
  24: "공격 (전체)",
  8: "옐로카드",
  9: "레드카드",
  3: "오프사이드",
  37: "패스 성공률 (%)",
};

interface Stat {
  type?: number;
  home?: number;
  away?: number;
}

interface Props {
  stats: Stat[];
  homeNameKo: string;
  awayNameKo: string;
}

function Bar({ home, away, max }: { home: number; away: number; max: number }) {
  const homePct = max > 0 ? (home / max) * 100 : 0;
  const awayPct = max > 0 ? (away / max) * 100 : 0;
  return (
    <div className="flex items-center gap-1 h-1.5">
      <div className="flex-1 flex justify-end">
        <div
          className="bg-rose-500 h-full rounded-l"
          style={{ width: `${homePct}%`, transition: "width 0.4s" }}
        />
      </div>
      <div className="w-px h-3 bg-neutral-700" />
      <div className="flex-1">
        <div
          className="bg-blue-500 h-full rounded-r"
          style={{ width: `${awayPct}%`, transition: "width 0.4s" }}
        />
      </div>
    </div>
  );
}

export default function SoccerLiveStatsCard({ stats, homeNameKo, awayNameKo }: Props) {
  // 알 수 있는 type 만 표시 (raw 그대로 노출 X — 미지원 type 은 hide)
  const known = stats
    .filter((s) => s.type != null && STAT_LABELS[s.type])
    .filter((s) => (s.home ?? 0) + (s.away ?? 0) > 0);

  if (known.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">실시간 통계 비교</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      {/* 헤더: 양 팀명 */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-semibold truncate">{homeNameKo}</div>
        <div className="text-neutral-500">vs</div>
        <div className="text-left text-blue-600 dark:text-blue-400 font-semibold truncate">{awayNameKo}</div>
      </div>

      {/* 각 통계 row */}
      <ul className="space-y-2.5">
        {known.map((s) => {
          const h = s.home ?? 0;
          const a = s.away ?? 0;
          const max = Math.max(h, a, 1);
          return (
            <li key={s.type}>
              <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 mb-0.5 text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums text-right">{h}</span>
                <span className="text-center text-neutral-500 text-[11px]">
                  {STAT_LABELS[s.type!]}
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-bold tabular-nums text-left">{a}</span>
              </div>
              <Bar home={h} away={a} max={max} />
            </li>
          );
        })}
      </ul>

      <div className="mt-3 text-[10px] text-neutral-500 leading-relaxed">
        ⓘ 통계 라벨은 TheSports type code 추정. 정확한 매핑은 공식 status code 문서 확보 후 보정 예정.
      </div>
    </section>
  );
}
