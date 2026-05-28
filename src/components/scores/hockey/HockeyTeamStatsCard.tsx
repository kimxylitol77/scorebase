// 하키 (NHL/IIHF_WC) 팀 통계 비교 — TheSports detailLive.stats 의 Match 전체 row.
// stats row = [statId, home, away]. % 항목(7/10/12/13/16)은 0~1 비율 → ×100 표시.
// statId 매핑은 IIHF_WC 라이브 cache 관측값 (2026-05-28 검증).

const HOCKEY_STAT_LABELS: Record<number, { label: string; pct?: boolean }> = {
  6: { label: "유효 슈팅" },
  7: { label: "슈팅 성공률", pct: true },
  9: { label: "선방" },
  10: { label: "선방률", pct: true },
  4: { label: "페널티" },
  11: { label: "페널티 분(PIM)" },
  2: { label: "파워플레이 골" },
  3: { label: "단신 골" },
  12: { label: "파워플레이 %", pct: true },
  13: { label: "페널티킬 %", pct: true },
  15: { label: "페이스오프 승" },
  16: { label: "페이스오프 %", pct: true },
  17: { label: "빈 골대 골" },
};
// 표시 순서 (캡처 순서 기준)
const ORDER = [6, 7, 9, 10, 4, 11, 2, 3, 12, 13, 15, 16, 17];

export interface HockeyStatRow {
  statId: number;
  home: number;
  away: number;
}

interface Props {
  rows: HockeyStatRow[];
  homeNameKo: string;
  awayNameKo: string;
}

function fmt(v: number, pct?: boolean): string {
  if (pct) {
    const p = v * 100;
    return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
  }
  return String(v);
}

function Bar({ home, away }: { home: number; away: number }) {
  const max = Math.max(home, away, 0.0001);
  const homePct = (home / max) * 100;
  const awayPct = (away / max) * 100;
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

export default function HockeyTeamStatsCard({ rows, homeNameKo, awayNameKo }: Props) {
  const byId = new Map(rows.map((r) => [r.statId, r]));
  // cache 에 있는 알려진 statId 는 모두 표시 (0-0 항목 포함 — 캡처와 동일하게).
  const known = ORDER.map((id) => byId.get(id)).filter(
    (r): r is HockeyStatRow => !!r && HOCKEY_STAT_LABELS[r.statId] != null,
  );

  if (known.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">팀 통계</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-semibold truncate">
          {homeNameKo}
        </div>
        <div className="text-neutral-500">vs</div>
        <div className="text-left text-blue-600 dark:text-blue-400 font-semibold truncate">
          {awayNameKo}
        </div>
      </div>

      <ul className="space-y-2.5">
        {known.map((s) => {
          const meta = HOCKEY_STAT_LABELS[s.statId];
          return (
            <li key={s.statId}>
              <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 mb-0.5 text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums text-right">
                  {fmt(s.home, meta.pct)}
                </span>
                <span className="text-center text-neutral-500 text-[11px]">{meta.label}</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold tabular-nums text-left">
                  {fmt(s.away, meta.pct)}
                </span>
              </div>
              <Bar home={s.home} away={s.away} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
