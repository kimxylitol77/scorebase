// 한 팀의 시즌 매치별 결과를 가로로 작은 격자로 표시.
// recharts 안 씀 (단순 격자라 div 만으로 충분, 가볍게).

interface Cell {
  result: "W" | "D" | "L";
  date: Date;
  score: { my: number; opp: number };
  isHome: boolean;
}

interface Props {
  name: string;
  cells: Cell[];
}

const COLORS: Record<"W" | "D" | "L", string> = {
  W: "bg-emerald-500",
  D: "bg-neutral-400 dark:bg-neutral-600",
  L: "bg-rose-500",
};

export default function SeasonFormHeatmap({ name, cells }: Props) {
  if (cells.length === 0) {
    return (
      <div>
        <div className="text-sm font-medium mb-1.5">{name}</div>
        <div className="text-xs text-neutral-400">시즌 매치 데이터 없음</div>
      </div>
    );
  }

  const wins = cells.filter((c) => c.result === "W").length;
  const draws = cells.filter((c) => c.result === "D").length;
  const losses = cells.filter((c) => c.result === "L").length;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-neutral-500 tabular-nums">
          {wins}승 {draws}무 {losses}패 ({cells.length}경기)
        </div>
      </div>
      <div className="grid grid-flow-col auto-cols-fr gap-[3px]">
        {cells.map((c, i) => (
          <div
            key={i}
            className={`h-6 rounded-sm ${COLORS[c.result]} hover:scale-110 transition`}
            title={`${c.isHome ? "홈" : "원정"} ${c.score.my}-${c.score.opp} (${c.date.toISOString().slice(0, 10)})`}
          />
        ))}
      </div>
    </div>
  );
}
