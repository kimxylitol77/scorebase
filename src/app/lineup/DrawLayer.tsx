"use client";
// 전술 그리기 오버레이 — 피치 위 SVG. 펜·선·화살표·점선·사각형·원·공·지우개.
// select 도구면 pointer-events:none(선수 드래그만), 그리기 도구면 선수 위를 덮어 그리기만(충돌 차단).
import { useRef, useState, useCallback } from "react";
import { type Tool, type StrokeColor, type Stroke, STROKE_COLORS, newStrokeId, hitStroke } from "@/lib/lineup/drawing";

interface Props {
  strokes: Stroke[];
  tool: Tool;
  color: StrokeColor;
  onCommitStroke: (s: Stroke) => void;
  onErase: (id: string) => void;
  onDrawStart?: () => void; // undo 체크포인트
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export default function DrawLayer({ strokes, tool, color, onCommitStroke, onErase, onDrawStart }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const draftRef = useRef<Stroke | null>(null); // 진실원천(렌더와 분리 — updater 안 사이드이펙트 금지)
  const drawing = useRef(false);

  const setBoth = useCallback((s: Stroke | null) => {
    draftRef.current = s;
    setDraft(s);
  }, []);

  const toXY = useCallback((e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [
      r1(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))),
      r1(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100))),
    ];
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      if (tool === "select") return;
      try {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
      } catch {
        /* 무시 */
      }
      const [x, y] = toXY(e);
      if (tool === "eraser") {
        drawing.current = true;
        const id = hitStroke(strokes, x, y);
        if (id) onErase(id);
        return;
      }
      if (tool === "ball") {
        onDrawStart?.();
        onCommitStroke({ id: newStrokeId(), kind: "ball", at: [x, y] });
        return;
      }
      onDrawStart?.();
      drawing.current = true;
      if (tool === "pen") setBoth({ id: newStrokeId(), kind: "pen", color, pts: [x, y] });
      else setBoth({ id: newStrokeId(), kind: tool, color, from: [x, y], to: [x, y] } as Stroke);
    },
    [tool, color, strokes, toXY, setBoth, onErase, onCommitStroke, onDrawStart],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing.current) return;
      const [x, y] = toXY(e);
      if (tool === "eraser") {
        const id = hitStroke(strokes, x, y);
        if (id) onErase(id);
        return;
      }
      const d = draftRef.current;
      if (!d || d.kind === "ball") return;
      if (d.kind === "pen") {
        const lx = d.pts[d.pts.length - 2];
        const ly = d.pts[d.pts.length - 1];
        if (Math.abs(x - lx) + Math.abs(y - ly) < 1.2) return;
        setBoth({ ...d, pts: [...d.pts, x, y] });
      } else {
        setBoth({ ...d, to: [x, y] });
      }
    },
    [tool, strokes, toXY, setBoth, onErase],
  );

  const onUp = useCallback(() => {
    drawing.current = false;
    const d = draftRef.current;
    if (d && tool !== "eraser") onCommitStroke(d);
    setBoth(null);
  }, [tool, setBoth, onCommitStroke]);

  const all = draft ? [...strokes, draft] : strokes;
  // 공은 stretch(preserveAspectRatio="none") 되는 SVG 안 <circle> 로 그리면 계란형 → SVG 밖 HTML 레이어로 분리.
  const balls = all.filter((s): s is Extract<Stroke, { kind: "ball" }> => s.kind === "ball");
  const shapes = all.filter((s) => s.kind !== "ball");
  return (
    <>
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: tool === "select" ? "none" : "auto", touchAction: "none", cursor: tool === "select" ? "default" : "crosshair" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <defs>
          {Object.entries(STROKE_COLORS).map(([k, c]) => (
            <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {shapes.map((s) => (
          <StrokeShape key={s.id} s={s} />
        ))}
      </svg>
      {balls.length > 0 && (
        <div className="pointer-events-none absolute inset-0">
          {balls.map((s) => (
            <span
              key={s.id}
              className="absolute block h-[clamp(15px,3.6vw,24px)] w-[clamp(15px,3.6vw,24px)] -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${s.at[0]}%`, top: `${s.at[1]}%` }}
            >
              <SoccerBall />
            </span>
          ))}
        </div>
      )}
    </>
  );
}

// 축구공 — 흰 구체 + 중앙 검은 오각형 + 5개 솔기. 자체 viewBox(정사각)라 컨테이너가 약간 비뚤어도 정원 유지.
function SoccerBall() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)]" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#ffffff" stroke="#171717" strokeWidth="1.6" />
      <polygon points="16,10.5 21.2,14.3 19.2,20.5 12.8,20.5 10.8,14.3" fill="#171717" />
      <path
        d="M16,10.5 L16,2.5 M21.2,14.3 L28.8,11.8 M19.2,20.5 L23.9,26.9 M12.8,20.5 L8.1,26.9 M10.8,14.3 L3.2,11.8"
        stroke="#171717"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StrokeShape({ s }: { s: Stroke }) {
  if (s.kind === "ball") return null; // 공은 SVG 밖 HTML 오버레이(SoccerBall)에서 렌더 — stretch 계란형 차단
  const c = STROKE_COLORS[s.color];
  if (s.kind === "pen") {
    const pts: string[] = [];
    for (let i = 0; i + 1 < s.pts.length; i += 2) pts.push(`${s.pts[i]},${s.pts[i + 1]}`);
    return <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
  }
  if (s.kind === "rect") {
    const x = Math.min(s.from[0], s.to[0]);
    const y = Math.min(s.from[1], s.to[1]);
    return <rect x={x} y={y} width={Math.abs(s.to[0] - s.from[0])} height={Math.abs(s.to[1] - s.from[1])} fill="none" stroke={c} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />;
  }
  if (s.kind === "ellipse") {
    return <ellipse cx={(s.from[0] + s.to[0]) / 2} cy={(s.from[1] + s.to[1]) / 2} rx={Math.abs(s.to[0] - s.from[0]) / 2} ry={Math.abs(s.to[1] - s.from[1]) / 2} fill="none" stroke={c} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />;
  }
  return (
    <line
      x1={s.from[0]}
      y1={s.from[1]}
      x2={s.to[0]}
      y2={s.to[1]}
      stroke={c}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeDasharray={s.kind === "dashed" ? "4 3" : undefined}
      markerEnd={s.kind === "arrow" ? `url(#arr-${s.color})` : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}
