// 야구 박스스코어 카드 — TheSports detail_live.players 기반.
// 타자/투수 분리. 확정 매핑된 stat_id 만 컬럼 표시.
// 선수 이름은 별도 source (api-sports starters / KBO starters) 가 없는 경우
// id 의 마지막 4자만 표시 — 매핑 추가 후 확장.

import { extractPlayerStats, playerStatColumns } from "@/lib/sports/thesports/baseball-stats";

interface Props {
  players: unknown;
  homeNameKo: string;
  awayNameKo: string;
  /** TheSports player id → display name. 매핑 없으면 id 약자. */
  playerNameById?: Record<string, string>;
}

function fmt(v: number | undefined, decimal: boolean): string {
  if (v == null) return "-";
  if (decimal) return v.toFixed(2);
  return v.toString();
}

function renderTable(
  rows: ReturnType<typeof extractPlayerStats>["home"],
  role: "batter" | "pitcher",
  nameById?: Record<string, string>,
) {
  const subset = rows.filter((r) => r.role === role);
  if (subset.length === 0) return null;
  const cols = playerStatColumns(role);
  if (cols.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800">
            <th className="text-left py-1.5 pr-2 font-medium text-neutral-500">{role === "batter" ? "타자" : "투수"}</th>
            {cols.map((c) => (
              <th key={c.statId} className="text-right px-1.5 py-1.5 font-medium text-neutral-500 tabular-nums">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {subset.slice(0, 9).map((p) => {
            const name = nameById?.[p.playerId] ?? p.playerId.slice(-4);
            return (
              <tr key={p.playerId} className="border-b border-neutral-100 dark:border-neutral-900">
                <td className="py-1 pr-2 truncate max-w-[120px]">{name}</td>
                {cols.map((c) => (
                  <td key={c.statId} className="text-right tabular-nums px-1.5">
                    {fmt(p.stats[c.statId], c.decimal)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BaseballBoxscoreCard({ players, homeNameKo, awayNameKo, playerNameById }: Props) {
  const { home, away } = extractPlayerStats(players);
  if (home.length === 0 && away.length === 0) return null;
  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-3 sm:p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">박스스코어</h2>
        <span className="text-[10px] text-neutral-400">TheSports</span>
      </header>

      <div className="space-y-3">
        <div>
          <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1.5">{homeNameKo}</div>
          {renderTable(home, "batter", playerNameById)}
          {renderTable(home, "pitcher", playerNameById)}
        </div>
        <div>
          <div className="text-xs font-medium text-rose-600 dark:text-rose-400 mb-1.5">{awayNameKo}</div>
          {renderTable(away, "batter", playerNameById)}
          {renderTable(away, "pitcher", playerNameById)}
        </div>
      </div>
    </section>
  );
}
