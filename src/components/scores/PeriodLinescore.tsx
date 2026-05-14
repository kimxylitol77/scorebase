// NBA 쿼터별 / NHL 피리어드별 점수표 — 매치 카드 mini board.
// BaseballLinescore 와 비슷하지만 H/E 없고 라벨이 종목별 (Q1·P1 등).

import type { PeriodLinescore as PeriodData } from "@/lib/sports/live-scores";

interface Props {
  data: PeriodData;
  /** "basketball" → Q1 Q2 Q3 Q4 OT,  "hockey" → P1 P2 P3 OT SO */
  sport: "basketball" | "hockey";
  awayLabel: string;
  homeLabel: string;
}

function labelFor(sport: "basketball" | "hockey", period: number): string {
  if (sport === "basketball") {
    if (period <= 4) return `Q${period}`;
    if (period === 5) return "OT";
    return `${period - 4}OT`;
  }
  // hockey
  if (period <= 3) return `P${period}`;
  if (period === 4) return "OT";
  return "SO";
}

export default function PeriodLinescore({
  data,
  sport,
  awayLabel,
  homeLabel,
}: Props) {
  const totalRegular = sport === "basketball" ? 4 : 3;
  const total = Math.max(
    totalRegular,
    data.awayPeriods.length,
    data.homePeriods.length,
  );
  const idx = Array.from({ length: total }, (_, i) => i);

  return (
    <div className="overflow-x-auto px-3.5 sm:px-4">
      <table className="text-xs sm:text-sm">
        <thead>
          <tr className="text-neutral-400">
            <th className="py-1.5 pr-3 text-left font-semibold">팀</th>
            {idx.map((i) => (
              <th
                key={i}
                className="px-1.5 py-1.5 text-center font-semibold tabular-nums"
              >
                {labelFor(sport, i + 1)}
              </th>
            ))}
            <th className="px-2 py-1.5 text-center font-bold text-neutral-700 dark:text-neutral-200 border-l border-neutral-200/60 dark:border-neutral-800">
              T
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
          <Row
            label={awayLabel}
            line={data.awayPeriods}
            total={data.awayScore}
            totalCells={total}
          />
          <Row
            label={homeLabel}
            line={data.homePeriods}
            total={data.homeScore}
            totalCells={total}
          />
        </tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  line,
  total,
  totalCells,
}: {
  label: string;
  line: (number | null)[];
  total: number;
  totalCells: number;
}) {
  return (
    <tr>
      <td className="py-1.5 pr-3 font-semibold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: totalCells }, (_, i) => (
        <td
          key={i}
          className="px-1.5 py-1.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400"
        >
          {line[i] ?? "-"}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-black tabular-nums border-l border-neutral-200/60 dark:border-neutral-800 text-neutral-900 dark:text-white">
        {total}
      </td>
    </tr>
  );
}
