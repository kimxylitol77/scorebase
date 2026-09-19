// 3분할(축구) 또는 2분할 확률 바 — 색만으로 구분하지 않도록 라벨·% 를 항상 병기.
type Props = {
  home: number;
  draw: number | null;
  away: number;
  homeLabel?: string;
  awayLabel?: string;
  size?: "sm" | "lg";
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function ProbBar({ home, draw, away, homeLabel = "Home", awayLabel = "Away", size = "sm" }: Props) {
  const total = home + (draw ?? 0) + away || 1;
  const w = (p: number) => `${(p / total) * 100}%`;
  const h = size === "lg" ? 12 : 8;
  const labelCls = size === "lg" ? "text-sm" : "text-xs";
  return (
    <div className="w-full">
      <div className={`sp-mono mb-1.5 flex justify-between font-bold ${labelCls}`}>
        <span style={{ color: "var(--sp-home)" }}>{homeLabel} {pct(home)}</span>
        {draw != null && <span style={{ color: "var(--sp-draw)" }}>Draw {pct(draw)}</span>}
        <span style={{ color: "var(--sp-away)" }}>{awayLabel} {pct(away)}</span>
      </div>
      <div className="flex w-full overflow-hidden rounded-full" style={{ height: h, background: "var(--sp-border-strong)" }} role="img" aria-label={`Home ${pct(home)}${draw != null ? `, draw ${pct(draw)}` : ""}, away ${pct(away)}`}>
        <div style={{ width: w(home), background: "var(--sp-home)" }} />
        {draw != null && <div style={{ width: w(draw), background: "var(--sp-draw)" }} />}
        <div style={{ width: w(away), background: "var(--sp-away)" }} />
      </div>
    </div>
  );
}
