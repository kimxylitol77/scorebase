// scores__baseball__BaseDiamond (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

interface Props {
  bases: [boolean, boolean, boolean] | null;
  size?: number;
}

// 빈 베이스 — light/dark 양쪽에서 보이도록 currentColor 기반 utility class.
const emptyClass =
  "border bg-neutral-200/70 border-neutral-300 dark:bg-white/[.06] dark:border-white/20";
// 차있는 베이스 — cyan glow.
const occupiedStyle: React.CSSProperties = {
  background: "#06b6d4",
  border: "1px solid #67e8f9",
  boxShadow: "0 0 14px rgba(6,182,212,.7)",
};

// 렌더 중 컴포넌트를 새로 만들면 매 렌더마다 DOM 이 재생성된다(react-hooks/static-components).
// 모듈 최상위로 올려 참조를 고정한다.
function Base({ on, style }: { on: boolean; style: React.CSSProperties }) {
  return (
    <div
      className={on ? "" : emptyClass}
      style={on ? { ...style, ...occupiedStyle } : style}
    />
  );
}

export default function BaseDiamond({ bases, size = 84 }: Props) {
  const b1 = !!bases?.[0];
  const b2 = !!bases?.[1];
  const b3 = !!bases?.[2];
  const baseSize = Math.round(size * 0.22);

  const positionStyle = (extra: React.CSSProperties): React.CSSProperties => ({
    position: "absolute",
    width: baseSize,
    height: baseSize,
    transform: "rotate(45deg)",
    transition: "background .25s, box-shadow .25s",
    ...extra,
  });

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      aria-label="Bases"
    >
      {/* 2루 (상단) */}
      <Base
        on={b2}
        style={positionStyle({
          left: "50%",
          top: 0,
          marginLeft: -baseSize / 2,
        })}
      />
      {/* 1루 (우측) */}
      <Base
        on={b1}
        style={positionStyle({
          right: 0,
          top: "50%",
          marginTop: -baseSize / 2,
        })}
      />
      {/* 3루 (좌측) */}
      <Base
        on={b3}
        style={positionStyle({
          left: 0,
          top: "50%",
          marginTop: -baseSize / 2,
        })}
      />
      {/* 홈 — 살짝 더 크게, 항상 outline only */}
      <div
        className="border bg-neutral-100 border-neutral-300 dark:bg-white/[.04] dark:border-white/25"
        style={{
          position: "absolute",
          left: "50%",
          bottom: 0,
          width: baseSize * 1.05,
          height: baseSize * 1.05,
          marginLeft: -(baseSize * 1.05) / 2,
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}
