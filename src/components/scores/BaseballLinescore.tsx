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
    <div className="overflow-x-auto px-3.5 sm:px-4">
      {/* w-full 제거 → 컬럼이 컨텐츠에 맞게 좁게 붙음. 글자 한 단계 크게. */}
      <table className="text-xs sm:text-sm">
        <thead>
          <tr className="text-neutral-400">
            <th className="py-1.5 pr-3 text-left font-semibold">팀</th>
            {idx.map((i) => (
              <th
                key={i}
                className="px-1.5 py-1.5 text-center font-semibold tabular-nums"
              >
                {i + 1}
              </th>
            ))}
            <th className="px-2 py-1.5 text-center font-bold text-neutral-700 dark:text-neutral-200 border-l border-neutral-200/60 dark:border-neutral-800">
              R
            </th>
            <th className="px-2 py-1.5 text-center font-semibold">H</th>
            <th className="py-1.5 pl-2 text-center font-semibold">E</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {/* home 위 / away 아래 — 사이트 home 좌측·상단 통일 규칙 */}
          <Row
            label={data.homeLabel}
            line={data.homeInnings}
            innings={innings}
            r={data.homeScore}
            h={data.homeHits}
            e={data.homeErrors}
          />
          <Row
            label={data.awayLabel}
            line={data.awayInnings}
            innings={innings}
            r={data.awayScore}
            h={data.awayHits}
            e={data.awayErrors}
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
      <td className="py-1.5 pr-3 font-semibold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: innings }, (_, i) => (
        <td
          key={i}
          className="px-1.5 py-1.5 text-center tabular-nums text-neutral-600 dark:text-neutral-400"
        >
          {line[i] ?? "-"}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-black tabular-nums border-l border-neutral-200/60 dark:border-neutral-800 text-neutral-900 dark:text-white">
        {r}
      </td>
      <td className="px-2 py-1.5 text-center tabular-nums text-neutral-500">
        {h ?? "-"}
      </td>
      <td className="py-1.5 pl-2 text-center tabular-nums text-neutral-500">
        {e ?? "-"}
      </td>
    </tr>
  );
}
