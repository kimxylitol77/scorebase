// 베이스 다이아몬드 + 아웃 카운트 — TheSports baseball detail_live.extra 기반.
// base "010" = 2루 주자 / "111" = 만루 / "000" = 무주자
// outs 0/1/2

interface Props {
  /** "000"~"111" — 1루/2루/3루 순서 */
  bases: string;
  /** 0 | 1 | 2 */
  outs: number;
  /** 작게 표시할지 — 카드 헤더 옆 inline 용 */
  size?: "sm" | "md";
}

export default function BaseballDiamond({ bases, outs, size = "md" }: Props) {
  const safe = /^[01]{3}$/.test(bases) ? bases : "000";
  const onFirst = safe[0] === "1";
  const onSecond = safe[1] === "1";
  const onThird = safe[2] === "1";

  // SVG viewBox: -50 ~ 50 (다이아몬드 중심 0,0)
  // 베이스 위치 (45° 회전한 정사각형)
  // 홈: bottom (0, 40), 1루: right (40, 0), 2루: top (0, -40), 3루: left (-40, 0)
  const px = size === "sm" ? "w-16 h-16" : "w-24 h-24";

  const baseColor = (active: boolean) =>
    active ? "#22c55e" : "rgba(148, 163, 184, 0.25)";
  const baseStroke = (active: boolean) =>
    active ? "#16a34a" : "rgba(148, 163, 184, 0.45)";

  return (
    <div className="inline-flex items-center gap-2">
      <svg
        viewBox="-50 -50 100 100"
        className={px}
        aria-label={`주자 ${[onFirst ? "1루" : "", onSecond ? "2루" : "", onThird ? "3루" : ""].filter(Boolean).join("·") || "무주자"}, ${outs}아웃`}
      >
        {/* 다이아몬드 외곽 — 베이스들 연결 line */}
        <polyline
          points="0,40 40,0 0,-40 -40,0 0,40"
          fill="none"
          stroke="rgba(148, 163, 184, 0.3)"
          strokeWidth={1.5}
        />
        {/* 2루 (top) */}
        <rect
          x={-9} y={-49} width={18} height={18}
          transform="rotate(45 0 -40)"
          fill={baseColor(onSecond)}
          stroke={baseStroke(onSecond)}
          strokeWidth={1.5}
        />
        {/* 3루 (left) */}
        <rect
          x={-49} y={-9} width={18} height={18}
          transform="rotate(45 -40 0)"
          fill={baseColor(onThird)}
          stroke={baseStroke(onThird)}
          strokeWidth={1.5}
        />
        {/* 1루 (right) */}
        <rect
          x={31} y={-9} width={18} height={18}
          transform="rotate(45 40 0)"
          fill={baseColor(onFirst)}
          stroke={baseStroke(onFirst)}
          strokeWidth={1.5}
        />
        {/* 홈 플레이트 (bottom) — 오각형 */}
        <polygon
          points="-7,38 7,38 9,44 0,50 -9,44"
          fill="rgba(255,255,255,0.85)"
          stroke="#94a3b8"
          strokeWidth={1}
        />
      </svg>
      {/* 아웃 카운트 dot */}
      <div className="flex flex-col gap-1">
        <div className="text-[9px] tracking-wider text-neutral-400 uppercase">Out</div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`w-2 h-2 rounded-full ${
                i < outs ? "bg-rose-500" : "bg-neutral-700"
              }`}
              aria-hidden
            />
          ))}
        </div>
      </div>
    </div>
  );
}
