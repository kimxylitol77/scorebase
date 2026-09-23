// 두 지표 산점도 — databallr "two click scatter". 규정 선수 전원을 SVG 로, 비교 담긴 선수와 양 축 상위는 이름 표시. 서버 렌더.
import Link from "next/link";
import { formatStat, type StatColumn, type StatUnit } from "@/lib/sports/baseball/stats-table";
import type { StatsViewRow } from "./types";

export default function StatsScatter({ rows, cols, x, y, unit, highlight, url }: {
  rows: StatsViewRow[]; cols: StatColumn[]; x: string; y: string; unit: StatUnit; highlight: string[];
  /** 축 선택 링크 생성 */
  url: (o: { x?: string; y?: string }) => string;
}) {
  const cx = cols.find((c) => c.key === x) ?? cols[1], cy = cols.find((c) => c.key === y) ?? cols[2];
  const pts = rows.filter((r) => r.qualified && r.cells[cx.key]?.value != null && r.cells[cy.key]?.value != null).map((r) => ({ r, vx: r.cells[cx.key].value!, vy: r.cells[cy.key].value! }));
  const W = 720, H = 440, L = 56, R = 20, T = 20, B = 44;
  const ext = (vals: number[]) => { const mn = Math.min(...vals), mx = Math.max(...vals); const pad = (mx - mn || 1) * 0.06; return [mn - pad, mx + pad]; };
  const [x0, x1] = pts.length ? ext(pts.map((p) => p.vx)) : [0, 1], [y0, y1] = pts.length ? ext(pts.map((p) => p.vy)) : [0, 1];
  const sx = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R), sy = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = (a: number, b: number, n = 5) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  // 이름 표시: 비교 담긴 선수 + 각 축 상위 4명(좋은 쪽)
  const topBy = (key: string, lower?: boolean) => [...pts].sort((p, q) => ((p.r.cells[key].value! - q.r.cells[key].value!) * (lower ? 1 : -1))).slice(0, 4).map((p) => p.r.key);
  const labeled = new Set([...highlight, ...topBy(cx.key, cx.lowerIsBetter), ...topBy(cy.key, cy.lowerIsBetter)]);
  const axisPick = (axis: "x" | "y", cur: StatColumn) => (
    <div className="flex flex-wrap gap-1">
      {cols.filter((c) => c.key !== "games").map((c) => (
        <Link key={c.key} href={url({ [axis]: c.key })} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${c.key === cur.key ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white" : "text-neutral-500 ring-black/10 hover:bg-white dark:ring-white/15 dark:hover:bg-white/10"}`}>{c.label}</Link>
      ))}
    </div>
  );
  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="grid gap-2 sm:grid-cols-2">
        <div><div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500">가로축 X</div>{axisPick("x", cx)}</div>
        <div><div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-neutral-500">세로축 Y</div>{axisPick("y", cy)}</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`${cx.label} 대 ${cy.label} 산점도`}>
        {ticks(x0, x1).map((v, i) => <g key={`x${i}`}><line x1={sx(v)} x2={sx(v)} y1={T} y2={H - B} className="stroke-neutral-100 dark:stroke-white/10" /><text x={sx(v)} y={H - B + 16} textAnchor="middle" className="fill-neutral-400 text-[10px] tabular-nums">{formatStat(v, cx, unit)}</text></g>)}
        {ticks(y0, y1).map((v, i) => <g key={`y${i}`}><line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="stroke-neutral-100 dark:stroke-white/10" /><text x={L - 6} y={sy(v) + 3} textAnchor="end" className="fill-neutral-400 text-[10px] tabular-nums">{formatStat(v, cy, unit)}</text></g>)}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" className="fill-neutral-500 text-[11px] font-semibold">{cx.label}{cx.lowerIsBetter ? " (낮을수록 상위)" : ""}</text>
        <text x={14} y={(T + H - B) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(T + H - B) / 2})`} className="fill-neutral-500 text-[11px] font-semibold">{cy.label}{cy.lowerIsBetter ? " (낮을수록 상위)" : ""}</text>
        {pts.map(({ r, vx, vy }) => {
          const hi = highlight.includes(r.key), lab = labeled.has(r.key);
          return (
            <g key={r.key}>
              <circle cx={sx(vx)} cy={sy(vy)} r={hi ? 6 : 3.5} className={hi ? "fill-rose-500 stroke-white dark:stroke-neutral-900" : "fill-sky-500/60 dark:fill-sky-400/60"} strokeWidth={hi ? 2 : 0}>
                <title>{r.name} · {cx.label} {formatStat(vx, cx, unit)} · {cy.label} {formatStat(vy, cy, unit)}</title>
              </circle>
              {lab && <text x={sx(vx) + 7} y={sy(vy) - 5} className={`text-[10px] ${hi ? "fill-rose-600 font-bold dark:fill-rose-400" : "fill-neutral-600 dark:fill-neutral-300"}`}>{r.name}</text>}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-[11px] text-neutral-400">규정 선수 {pts.length}명. 점 위에 올리면 값이 보이고, 비교에 담은 선수는 붉은 점으로 강조된다. 이름은 비교 선수와 양 축 상위 4명만.</p>
    </div>
  );
}
