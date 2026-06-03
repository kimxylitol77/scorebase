// 야구 매치 카드의 하단 미니 보드.
// "5회말 · 2사 · 1·3루" 표시 + 베이스 다이아몬드 + 아웃 3 dot.
// api-sports Baseball 은 베이스/카운트 미제공 → live=undefined 면 hide.

export interface BaseballContext {
  /** 1~9 (+연장) */
  inning?: number;
  /** "top" = 초, "bottom" = 말 */
  half?: "top" | "bottom" | null;
  /** 0, 1, 2 */
  outs?: number | null;
  /** [1루, 2루, 3루] */
  bases?: [boolean, boolean, boolean] | null;
  /** 연장 여부 — TheSports 가 연장 이닝별 미제공, ft(총점)로 감지. 라벨 "연장" 표시용. */
  isExtra?: boolean;
}

interface Props {
  ctx: BaseballContext;
}

function bases2text(b?: [boolean, boolean, boolean] | null): string {
  if (!b) return "—";
  const on: string[] = [];
  if (b[0]) on.push("1루");
  if (b[1]) on.push("2루");
  if (b[2]) on.push("3루");
  if (on.length === 0) return "주자 없음";
  return on.join("·");
}

export default function BaseballMiniBoard({ ctx }: Props) {
  const { inning, half, outs, bases } = ctx;
  if (!inning && !outs && !bases) return null;

  const half_ko = half === "top" ? "초" : half === "bottom" ? "말" : "";
  const inningText = ctx.isExtra ? `연장${inning ? ` ${inning > 9 ? inning : ""}` : ""}`.trim() : inning ? `${inning}회${half_ko}` : "";
  const outsText = outs != null ? `${outs}사` : "";

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="font-bold text-neutral-700 dark:text-neutral-300 tabular-nums">
        {inningText}
      </span>
      {outsText && (
        <span className="text-neutral-500">
          · {outsText}
        </span>
      )}
      <span className="text-neutral-500">· {bases2text(bases)}</span>
      <div className="baseball-diamond ml-auto shrink-0">
        <div className={`base b2 ${bases?.[1] ? "occupied" : ""}`} />
        <div className={`base b3 ${bases?.[2] ? "occupied" : ""}`} />
        <div className={`base b1 ${bases?.[0] ? "occupied" : ""}`} />
        <div className="base home" />
      </div>
      <div className="flex gap-0.5 ml-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              i < (outs ?? 0)
                ? "bg-rose-500"
                : "bg-neutral-300 dark:bg-neutral-700"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
