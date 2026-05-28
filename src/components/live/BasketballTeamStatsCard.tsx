// 농구 팀 통계 카드 — TheSports detail_live 기반 (네이버 스타일 "팀 통계" 탭 content).
// 쿼터별 점수표 + 팀 스탯(3점/2점/자유투/파울/FT%) + play-by-play(tlive).
// 데이터: cache.detailLive.score=[id,status,?,[q1..ot]home,[q1..ot]away], stats=[[statId,home,away]], tlive=[]

interface Props {
  detailLive: unknown;
  homeNameKo: string;
  awayNameKo: string;
}

// basketball stat_id → 라벨 (docs 표). 의미 있는 것만 표시.
const STAT_LABELS: Record<number, string> = {
  1: "3점 성공",
  2: "2점 성공",
  3: "자유투 성공",
  5: "파울",
  6: "자유투 %",
};
const STAT_ORDER = [1, 2, 3, 5, 6];

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export default function BasketballTeamStatsCard({ detailLive, homeNameKo, awayNameKo }: Props) {
  const dl = detailLive as { score?: unknown[]; stats?: unknown[]; tlive?: unknown[] } | null;
  const score = Array.isArray(dl?.score) ? dl!.score : null;
  const homeQ = Array.isArray(score?.[3]) ? (score![3] as unknown[]).map(num) : null;
  const awayQ = Array.isArray(score?.[4]) ? (score![4] as unknown[]).map(num) : null;

  // 팀 스탯
  const statsArr = Array.isArray(dl?.stats) ? dl!.stats : [];
  const statMap = new Map<number, [number | null, number | null]>();
  for (const s of statsArr) {
    if (Array.isArray(s) && s.length >= 3) {
      const id = num(s[0]);
      if (id != null) statMap.set(id, [num(s[1]), num(s[2])]);
    }
  }
  const statRows = STAT_ORDER.filter((id) => statMap.has(id)).map((id) => ({
    label: STAT_LABELS[id],
    home: statMap.get(id)![0],
    away: statMap.get(id)![1],
    pct: id === 6,
  }));

  // play-by-play (tlive) — 각 entry "q^time^?^?^score^description^..." 형태. 최근 30개.
  const tlive = Array.isArray(dl?.tlive) ? dl!.tlive : [];
  const plays = tlive
    .map((t) => {
      if (typeof t !== "string") return null;
      const f = t.split("^");
      const time = f[1] ?? "";
      const sc = f[4] ?? "";
      const desc = f[5] ?? "";
      if (!desc) return null;
      return { time, score: sc, desc };
    })
    .filter((p): p is { time: string; score: string; desc: string } => p !== null)
    .slice(0, 30);

  const hasQuarters = homeQ && awayQ && homeQ.some((v) => v != null);
  if (!hasQuarters && statRows.length === 0 && plays.length === 0) return null;

  const qLen = Math.max(homeQ?.length ?? 0, awayQ?.length ?? 0);
  const qLabels = Array.from({ length: qLen }, (_, i) =>
    i < 4 ? `${i + 1}Q` : i === 4 ? "OT" : `OT${i - 3}`,
  );

  return (
    <section className="space-y-4">
      {/* 쿼터별 점수 */}
      {hasQuarters && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">쿼터별 점수</h3>
            <span className="text-[10px] text-neutral-400">TheSports</span>
          </div>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-neutral-400">
                <th className="text-left font-medium py-1"></th>
                {qLabels.map((l) => (
                  <th key={l} className="text-center font-medium py-1 w-10">{l}</th>
                ))}
                <th className="text-center font-bold py-1 w-12">합계</th>
              </tr>
            </thead>
            <tbody>
              {[{ name: awayNameKo, q: awayQ }, { name: homeNameKo, q: homeQ }].map((row, ri) => {
                const total = (row.q ?? []).reduce((a: number, v) => a + (v ?? 0), 0);
                return (
                  <tr key={ri} className="border-t border-neutral-100 dark:border-neutral-900">
                    <td className="text-left py-1.5 font-medium truncate max-w-[7rem]">{row.name}</td>
                    {qLabels.map((_, qi) => (
                      <td key={qi} className="text-center py-1.5">{row.q?.[qi] ?? "-"}</td>
                    ))}
                    <td className="text-center py-1.5 font-bold">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 팀 스탯 비교 */}
      {statRows.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-3 items-center text-xs font-medium border-b border-neutral-100 dark:border-neutral-900 pb-1.5">
            <div className="text-right text-blue-600 dark:text-blue-400 truncate">{homeNameKo}</div>
            <div className="text-center text-neutral-400">팀 스탯</div>
            <div className="text-left text-rose-600 dark:text-rose-400 truncate">{awayNameKo}</div>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {statRows.map((r) => (
              <div key={r.label} className="grid grid-cols-3 items-center py-2 text-sm">
                <div className="text-right tabular-nums font-bold">{r.home ?? "-"}{r.pct && r.home != null ? "%" : ""}</div>
                <div className="text-center text-xs text-neutral-500">{r.label}</div>
                <div className="text-left tabular-nums font-bold">{r.away ?? "-"}{r.pct && r.away != null ? "%" : ""}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* play-by-play */}
      {plays.length > 0 && (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">실시간 플레이</h3>
            <span className="text-[10px] text-neutral-400">TheSports</span>
          </div>
          <ul className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-900 text-sm">
            {plays.map((p, i) => (
              <li key={i} className="flex items-start gap-2 py-1.5">
                <span className="shrink-0 tabular-nums text-xs text-neutral-400 w-10">{p.time}</span>
                {p.score && <span className="shrink-0 tabular-nums text-xs font-bold text-neutral-600 dark:text-neutral-300 w-10">{p.score}</span>}
                <span className="text-neutral-700 dark:text-neutral-200">{p.desc}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
