// 스플릿 — vs 좌/우, 홈/원정 카드 + 월별 추이. 타자(AVG/OPS/HR) / 투수(ERA/WHIP/IP).

import type { PlayerSplits, SplitRow } from "@/lib/sports/mlb-player-extras";

function SplitCard({
  row,
  group,
}: {
  row: SplitRow | undefined;
  group: "hitting" | "pitching";
}) {
  if (!row) return null;
  const primary =
    group === "hitting"
      ? [
          { k: "OPS", val: row.ops ?? "—" },
          { k: "타율", val: row.avg ?? "—" },
          { k: "HR", val: row.hr != null ? String(row.hr) : "—" },
        ]
      : [
          { k: "ERA", val: row.era ?? "—" },
          { k: "WHIP", val: row.whip ?? "—" },
          { k: "IP", val: row.ip ?? "—" },
        ];
  return (
    <div className="rounded-xl bg-white p-3.5 ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="text-xs font-bold text-neutral-500 mb-2.5">{row.label}</div>
      <div className="grid grid-cols-3 gap-2">
        {primary.map((p, i) => (
          <div key={p.k}>
            <div className="text-[10px] text-neutral-400">{p.k}</div>
            <div
              className={`text-base font-black tabular-nums ${
                i === 0 ? "text-blue-600 dark:text-blue-400" : ""
              }`}
            >
              {p.val}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthTable({
  rows,
  group,
}: {
  rows: SplitRow[];
  group: "hitting" | "pitching";
}) {
  if (rows.length === 0) return null;
  const cols =
    group === "hitting"
      ? [
          ["타율", (r: SplitRow) => r.avg ?? "—"],
          ["OPS", (r: SplitRow) => r.ops ?? "—"],
          ["HR", (r: SplitRow) => (r.hr != null ? String(r.hr) : "—")],
          ["PA", (r: SplitRow) => (r.pa != null ? String(r.pa) : "—")],
        ]
      : [
          ["ERA", (r: SplitRow) => r.era ?? "—"],
          ["WHIP", (r: SplitRow) => r.whip ?? "—"],
          ["IP", (r: SplitRow) => r.ip ?? "—"],
          ["K", (r: SplitRow) => (r.so != null ? String(r.so) : "—")],
        ];
  const cols2 = cols as [string, (r: SplitRow) => string][];
  return (
    <div>
      <div className="text-xs font-bold text-neutral-500 mb-2">월별 추이</div>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">월</th>
              {cols2.map(([h]) => (
                <th key={h} className="px-3 py-2 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-3 py-2 text-left font-semibold">{r.label}</td>
                {cols2.map(([h, f], i) => (
                  <td
                    key={h}
                    className={`px-3 py-2 text-right tabular-nums ${
                      i === 0 ? "font-bold" : "text-neutral-500"
                    }`}
                  >
                    {f(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SplitsView({
  splits,
  group,
}: {
  splits: PlayerSplits;
  group: "hitting" | "pitching";
}) {
  const hasLR = splits.vsLeft || splits.vsRight;
  const hasHA = splits.home || splits.away;
  if (!hasLR && !hasHA && splits.byMonth.length === 0) {
    return (
      <p className="text-sm text-neutral-500">이 시즌 스플릿 데이터가 아직 없습니다.</p>
    );
  }
  return (
    <div className="space-y-5">
      {hasLR && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">투수 좌우 상대</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.vsLeft} group={group} />
            <SplitCard row={splits.vsRight} group={group} />
          </div>
        </div>
      )}
      {hasHA && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">홈 / 원정</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.home} group={group} />
            <SplitCard row={splits.away} group={group} />
          </div>
        </div>
      )}
      <MonthTable rows={splits.byMonth} group={group} />
    </div>
  );
}
