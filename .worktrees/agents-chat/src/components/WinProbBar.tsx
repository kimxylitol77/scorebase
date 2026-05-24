// 승률을 가로 막대 그래프로 표시.

interface Props {
  homeProb: number; // 0~1
  drawProb: number; // 0~1
  awayProb: number; // 0~1
  homeName: string;
  awayName: string;
  /** 무승부 칸을 숨김 (NBA/KBO 등 정규시간 무승부 없는 종목) */
  hideDraw?: boolean;
}

function pct(p: number) {
  return Math.round(p * 100);
}

export default function WinProbBar({
  homeProb,
  drawProb,
  awayProb,
  homeName,
  awayName,
  hideDraw = false,
}: Props) {
  const homePct = pct(homeProb);
  const drawPct = pct(drawProb);
  const awayPct = pct(awayProb);

  // 합이 99~101 이 될 수 있어 정규화
  const total = homePct + drawPct + awayPct;
  const h = Math.round((homePct / total) * 100);
  const d = hideDraw ? 0 : Math.round((drawPct / total) * 100);
  const a = 100 - h - d;

  return (
    <div className="space-y-2">
      <div className="flex h-9 rounded-lg overflow-hidden ring-1 ring-neutral-200 dark:ring-neutral-700">
        <div
          className="bg-blue-500 text-white text-xs font-bold flex items-center justify-center px-2"
          style={{ width: `${h}%` }}
        >
          {h >= 8 ? `${homePct}%` : ""}
        </div>
        {!hideDraw && (
          <div
            className="bg-neutral-400 dark:bg-neutral-600 text-white text-xs font-bold flex items-center justify-center px-2"
            style={{ width: `${d}%` }}
          >
            {d >= 8 ? `${drawPct}%` : ""}
          </div>
        )}
        <div
          className="bg-rose-500 text-white text-xs font-bold flex items-center justify-center px-2"
          style={{ width: `${a}%` }}
        >
          {a >= 8 ? `${awayPct}%` : ""}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <span className="font-medium text-blue-600 dark:text-blue-400 truncate max-w-[40%]">
          🏠 {homeName}
        </span>
        {!hideDraw && (
          <span className="text-neutral-500 font-medium">무</span>
        )}
        <span className="font-medium text-rose-600 dark:text-rose-400 truncate max-w-[40%] text-right">
          {awayName} ✈
        </span>
      </div>
    </div>
  );
}
