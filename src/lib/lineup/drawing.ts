// 전술 그리기 모델 — 피치 위 SVG 오버레이 stroke. 좌표는 0~100% (반응형·캡처 무관).
// 그림은 URL 인코딩에서 제외(화면 캡처 PNG로만 공유) — board.strokes는 런타임·캡처용.

export type Tool = "select" | "pen" | "line" | "arrow" | "dashed" | "rect" | "ellipse" | "ball" | "eraser";
export type StrokeColor = "white" | "rose" | "amber" | "sky";

export const STROKE_COLORS: Record<StrokeColor, string> = {
  white: "#ffffff",
  rose: "#fb7185",
  amber: "#fbbf24",
  sky: "#38bdf8",
};
export const STROKE_COLOR_KEYS: StrokeColor[] = ["white", "rose", "amber", "sky"];

export type Stroke =
  | { id: string; kind: "pen"; color: StrokeColor; pts: number[] } // [x0,y0,x1,y1,...]
  | { id: string; kind: "line" | "arrow" | "dashed"; color: StrokeColor; from: [number, number]; to: [number, number] }
  | { id: string; kind: "rect" | "ellipse"; color: StrokeColor; from: [number, number]; to: [number, number] }
  | { id: string; kind: "ball"; at: [number, number] };

let sid = 0;
export function newStrokeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `s${(sid++).toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// 점-선분 거리(지우개 hit-test용). 좌표 0~100%.
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// 좌표(x,y %)에 닿는 stroke 찾기 — 지우개. 임계 3% 이내.
export function hitStroke(strokes: Stroke[], x: number, y: number): string | null {
  const TH = 3.5;
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i];
    if (s.kind === "pen") {
      for (let j = 0; j + 3 < s.pts.length; j += 2) {
        if (distToSegment(x, y, s.pts[j], s.pts[j + 1], s.pts[j + 2], s.pts[j + 3]) < TH) return s.id;
      }
    } else if (s.kind === "ball") {
      if (Math.hypot(x - s.at[0], y - s.at[1]) < TH + 2) return s.id;
    } else if (s.kind === "rect" || s.kind === "ellipse") {
      const [x0, y0] = s.from;
      const [x1, y1] = s.to;
      const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
      const onEdge =
        ((Math.abs(x - minX) < TH || Math.abs(x - maxX) < TH) && y > minY - TH && y < maxY + TH) ||
        ((Math.abs(y - minY) < TH || Math.abs(y - maxY) < TH) && x > minX - TH && x < maxX + TH);
      if (onEdge) return s.id;
    } else {
      if (distToSegment(x, y, s.from[0], s.from[1], s.to[0], s.to[1]) < TH) return s.id;
    }
  }
  return null;
}
