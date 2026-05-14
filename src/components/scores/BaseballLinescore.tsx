// 매치 카드 안에 들어가는 컴팩트 이닝별 점수 표 (1~9 + R H E).
// SoccerMiniBoard / EsportsMiniBoard 와 같은 위치 (카드 하단 mini board 영역).

export interface BaseballLinescoreData {
  awayInnings: (number | null)[];
  homeInnings: (number | null)[];
  awayScore: number;
  homeScore: number;
  awayHits: number | null;
  homeHits: number | null;
  awayErrors: number | null;
  homeErrors: number | null;
  awayLabel: string;
  homeLabel: string;
}

interface Props {
  data: BaseballLinescoreData;
}

export default function BaseballLinescore({ data }: Props) {
  // 최소 9 이닝, 연장은 더 길게 (둘 중 max)
  const innings = Math.max(9, data.awayInnings.length, data.homeInnings.length);
  const idx = Array.from({ length: innings }, (_, i) => i);

  return (
    <div className="overflow-x-auto -mx-3.5 sm:-mx-4">
      <table className="w-full min-w-full text-[10px] sm:text-[11px]">
        <thead>
          <tr className="text-neutral-400">
            <th className="px-2 sm:px-3 py-1 text-left font-semibold w-10 sm:w-14">
              팀
            </th>
            {idx.map((i) => (
              <th
                key={i}
                className="px-1 py-1 text-center font-semibold tabular-nums"
              >
                {i + 1}
              </th>
            ))}
            <th className="px-1.5 py-1 text-center font-bold text-neutral-700 dark:text-neutral-200 border-l border-neutral-200/60 dark:border-neutral-800">
              R
            </th>
            <th className="px-1.5 py-1 text-center font-semibold">H</th>
            <th className="px-1.5 py-1 text-center font-semibold pr-2 sm:pr-3">
              E
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
          <Row
            label={data.awayLabel}
            line={data.awayInnings}
            innings={innings}
            r={data.awayScore}
            h={data.awayHits}
            e={data.awayErrors}
          />
          <Row
            label={data.homeLabel}
            line={data.homeInnings}
            innings={innings}
            r={data.homeScore}
            h={data.homeHits}
            e={data.homeErrors}
          />
        </tbody>
      </table>
    </div>
  );
}

function Row({
  label,
  line,
  innings,
  r,
  h,
  e,
}: {
  label: string;
  line: (number | null)[];
  innings: number;
  r: number;
  h: number | null;
  e: number | null;
}) {
  return (
    <tr>
      <td className="px-2 sm:px-3 py-1 font-semibold truncate text-neutral-700 dark:text-neutral-200">
        {label}
      </td>
      {Array.from({ length: innings }, (_, i) => (
        <td
          key={i}
          className="px-1 py-1 text-center tabular-nums text-neutral-600 dark:text-neutral-400"
        >
          {line[i] ?? "-"}
        </td>
      ))}
      <td className="px-1.5 py-1 text-center font-black tabular-nums border-l border-neutral-200/60 dark:border-neutral-800 text-neutral-900 dark:text-white">
        {r}
      </td>
      <td className="px-1.5 py-1 text-center tabular-nums text-neutral-500">
        {h ?? "-"}
      </td>
      <td className="px-1.5 py-1 text-center tabular-nums text-neutral-500 pr-2 sm:pr-3">
        {e ?? "-"}
      </td>
    </tr>
  );
}
