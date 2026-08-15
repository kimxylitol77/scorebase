// 공용 축구 피치 — 잔디 + 규격 라인(단일 SVG) + 선수 마커 슬롯.
// 라인과 선수(%)가 같은 정규화 좌표공간을 공유하고 컨테이너 종횡비를 SVG viewBox 와
// 일치시켜(preserveAspectRatio="xMidYMid meet") 화면비·창폭이 달라져도 절대 어긋나지 않는다.
// 센터서클은 SVG <circle>(균일 스케일)로 그려 고정px div 방식의 타원·드리프트 버그를 원천 차단.
import type { CSSProperties, ReactNode } from "react";
import PitchSentinel from "./PitchSentinel";

type Orientation = "vertical" | "horizontal";

interface PitchProps {
  /** 골문 방향 — vertical: 위/아래, horizontal: 좌/우. 기본 vertical. */
  orientation?: Orientation;
  /** 컨테이너 가로/세로 비(W/H). 예: 세로 3/4.2≈0.714, 가로 16/10=1.6. viewBox 가 이 비율로 생성된다. */
  aspect?: number;
  grassFrom?: string;
  grassTo?: string;
  /** 잔디 줄무늬 표시. */
  stripes?: boolean;
  markingOpacity?: number;
  markingColor?: string;
  className?: string;
  style?: CSSProperties;
  /** 절대배치 마커들(PitchMarker) 또는 임의 오버레이. */
  children?: ReactNode;
}

// 피치 위 % 좌표 마커 — left/top %(0~100, viewBox 좌표와 동일) + 중앙 정렬.
// 중앙 정렬은 Tailwind -translate-x-1/2 대신 인라인 transform 으로 한다.
// Tailwind 4 의 translate 유틸은 CSS `translate` 단독 속성으로 컴파일되는데
// 구형 Chromium(<104, 웨일·웹뷰 잔존)이 이를 무시해 XI 전체가 우하향으로
// 반 마커씩 쏠렸다(2026-08-15 윈도우 실사용 신고). transform 은 전 브라우저 지원.
export function PitchMarker({
  x,
  y,
  className,
  style,
  children,
}: {
  x: number;
  y: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      data-pitch-marker
      className={`absolute ${className ?? ""}`}
      style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)", ...style }}
    >
      {children}
    </div>
  );
}

export default function Pitch({
  orientation = "vertical",
  aspect = orientation === "vertical" ? 3 / 4.2 : 16 / 10,
  grassFrom = "#0f5132",
  grassTo = "#0a3d27",
  stripes = false,
  markingOpacity = 0.16,
  markingColor = "#ffffff",
  className,
  style,
  children,
}: PitchProps) {
  const vertical = orientation === "vertical";
  // viewBox — 긴 축을 100으로 정규화하고 나머지를 aspect 로 산출(= 컨테이너 비율과 동일).
  const vbW = vertical ? 100 : 100;
  const vbH = vertical ? 100 / aspect : 100 / aspect;
  // meet + 컨테이너 aspect == viewBox aspect 라 단위가 정사각 → <circle> 이 정원.
  return (
    <div
      className={`relative w-full overflow-hidden ${className ?? ""}`}
      style={{
        aspectRatio: `${aspect}`,
        background: `linear-gradient(${vertical ? "to bottom" : "to right"}, ${grassFrom}, ${grassTo})`,
        ...style,
      }}
    >
      {stripes && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(${vertical ? "180deg" : "90deg"}, rgba(255,255,255,0.05) 0, rgba(255,255,255,0.05) 9.09%, rgba(0,0,0,0.05) 9.09%, rgba(0,0,0,0.05) 18.18%)`,
          }}
          aria-hidden
        />
      )}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="xMidYMid meet"
        fill="none"
        stroke={markingColor}
        strokeOpacity={markingOpacity}
        strokeWidth={0.35}
        aria-hidden="true"
      >
        <PitchMarkings vbW={vbW} vbH={vbH} vertical={vertical} markingColor={markingColor} markingOpacity={markingOpacity} />
      </svg>
      {children}
      <PitchSentinel />
    </div>
  );
}

// 규격 라인 — 외곽·중앙선·센터서클/스팟·페널티 에어리어·골 에어리어·페널티 스팟·아크.
// 좌표는 viewBox 단위(정사각). vertical/horizontal 은 긴 축(길이) 방향만 다르다.
function PitchMarkings({
  vbW,
  vbH,
  vertical,
  markingColor,
  markingOpacity,
}: {
  vbW: number;
  vbH: number;
  vertical: boolean;
  markingColor: string;
  markingOpacity: number;
}) {
  const inset = 2.5;
  // 길이축(long) / 폭축(short)
  const L = vertical ? vbH : vbW; // 골문–골문 방향 길이
  const S = vertical ? vbW : vbH; // 좌우(폭)
  const r = 0.12 * S; // 센터서클 반지름(폭 기준 → 정원)
  const boxDepth = 0.15 * L; // 페널티 박스 깊이
  const boxW = 0.6 * S; // 페널티 박스 폭
  const gaDepth = 0.06 * L; // 골 에어리어 깊이
  const gaW = 0.3 * S; // 골 에어리어 폭
  const spotOff = 0.105 * L; // 골라인→페널티 스팟
  const spotR = 0.5;
  const midL = L / 2;
  const midS = S / 2;

  // (long, short) → (x, y) 매핑. vertical: long=세로(y), short=가로(x). horizontal: 반대.
  const P = (long: number, short: number): [number, number] =>
    vertical ? [short, long] : [long, short];

  const spotFill = { fill: markingColor, fillOpacity: markingOpacity + 0.15, stroke: "none" as const };

  // 페널티 아크 — 스팟 중심 반지름 r 원 중 박스 밖 부분.
  const dy = boxDepth - spotOff; // 박스선까지 거리
  const half = Math.sqrt(Math.max(0, r * r - dy * dy));
  const arc = (nearGoal: number, dir: 1 | -1) => {
    // nearGoal: 골라인 좌표(inset 또는 L-inset), dir: 필드 안쪽(+1 아래/오른쪽)
    const boxLine = nearGoal + dir * boxDepth;
    const [ax1, ay1] = P(boxLine, midS - half);
    const [ax2, ay2] = P(boxLine, midS + half);
    // sweep 는 방향에 따라 필드 중앙으로 볼록.
    const sweep = vertical ? (dir === 1 ? 1 : 0) : dir === 1 ? 0 : 1;
    return `M ${ax1} ${ay1} A ${r} ${r} 0 0 ${sweep} ${ax2} ${ay2}`;
  };

  const rect = (long1: number, short1: number, longLen: number, shortLen: number) => {
    const [x1, y1] = P(long1, short1);
    return vertical
      ? { x: x1, y: y1, width: shortLen, height: longLen }
      : { x: x1, y: y1, width: longLen, height: shortLen };
  };

  const [c1x, c1y] = P(midL, midS); // 센터
  const [s1x, s1y] = P(inset + spotOff, midS); // 위/좌 스팟
  const [s2x, s2y] = P(L - inset - spotOff, midS); // 아래/우 스팟
  // 중앙선
  const [m1x, m1y] = P(midL, inset);
  const [m2x, m2y] = P(midL, S - inset);

  return (
    <>
      {/* 외곽 */}
      <rect x={inset} y={inset} width={vbW - 2 * inset} height={vbH - 2 * inset} rx={1} />
      {/* 중앙선 */}
      <line x1={m1x} y1={m1y} x2={m2x} y2={m2y} />
      {/* 센터서클 + 스팟 */}
      <circle cx={c1x} cy={c1y} r={r} />
      <circle cx={c1x} cy={c1y} r={spotR} {...spotFill} />
      {/* 페널티 박스 (양 골문) */}
      <rect {...rect(inset, midS - boxW / 2, boxDepth, boxW)} />
      <rect {...rect(L - inset - boxDepth, midS - boxW / 2, boxDepth, boxW)} />
      {/* 골 에어리어 */}
      <rect {...rect(inset, midS - gaW / 2, gaDepth, gaW)} />
      <rect {...rect(L - inset - gaDepth, midS - gaW / 2, gaDepth, gaW)} />
      {/* 페널티 스팟 */}
      <circle cx={s1x} cy={s1y} r={spotR} {...spotFill} />
      <circle cx={s2x} cy={s2y} r={spotR} {...spotFill} />
      {/* 페널티 아크 */}
      <path d={arc(inset, 1)} />
      <path d={arc(L - inset, -1)} />
    </>
  );
}
