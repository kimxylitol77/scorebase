// 베이스 다이아몬드 (1·2·3루 + 홈) — cyan 글로우.
// rotate(45deg) 4개 정사각형. 차있는 베이스는 box-shadow glow.
// bases == null → 모두 비어있게 표시 (graceful degradation).

interface Props {
  bases: [boolean, boolean, boolean] | null;
  size?: number;
}

export default function BaseDiamond({ bases, size = 84 }: Props) {
  const b1 = !!bases?.[0];
  const b2 = !!bases?.[1];
  const b3 = !!bases?.[2];
  const baseSize = Math.round(size * 0.22);

  const occupied: React.CSSProperties = {
    background: "#06b6d4",
    border: "1px solid #67e8f9",
    boxShadow: "0 0 14px rgba(6,182,212,.7)",
  };
  const empty: React.CSSProperties = {
    background: "rgba(255,255,255,.06)",
    border: "1px solid rgba(255,255,255,.18)",
  };

  const baseStyle = (on: boolean): React.CSSProperties => ({
    position: "absolute",
    width: baseSize,
    height: baseSize,
    transform: "rotate(45deg)",
    transition: "background .25s, box-shadow .25s",
    ...(on ? occupied : empty),
  });

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      aria-label="베이스 상황"
    >
      {/* 2루 (상단) */}
      <div
        style={{
          ...baseStyle(b2),
          left: "50%",
          top: 0,
          marginLeft: -baseSize / 2,
        }}
      />
      {/* 1루 (우측) */}
      <div
        style={{
          ...baseStyle(b1),
          right: 0,
          top: "50%",
          marginTop: -baseSize / 2,
        }}
      />
      {/* 3루 (좌측) */}
      <div
        style={{
          ...baseStyle(b3),
          left: 0,
          top: "50%",
          marginTop: -baseSize / 2,
        }}
      />
      {/* 홈 — 살짝 더 크게 */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: baseSize * 1.05,
          height: baseSize * 1.05,
          marginLeft: -(baseSize * 1.05) / 2,
          transform: "rotate(45deg)",
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.2)",
        }}
      />
    </div>
  );
}
