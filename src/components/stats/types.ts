// 스탯 마스터 표(야구·축구 공용)의 화면용 행 — 페이지가 StatRow 에 사진·링크·부제를 붙여 넘긴다.
import type { StatColumn, StatRow } from "@/lib/sports/baseball/stats-table";

export interface StatsViewRow extends StatRow {
  photo: string | null;
  href: string | null;
  /** 팀 · 포지션 등 이름 아래 한 줄 */
  sub: string;
}

export type StatsView = "table" | "cards" | "leaders" | "scatter";
export const STATS_VIEW_KO: Record<StatsView, string> = { table: "표", cards: "카드", leaders: "리더", scatter: "산점도" };

/** 열 묶음 순서 보존 */
export function columnGroups(cols: StatColumn[]): Array<{ group: string; cols: StatColumn[] }> {
  const out: Array<{ group: string; cols: StatColumn[] }> = [];
  for (const c of cols) {
    const g = c.group ?? "";
    const last = out[out.length - 1];
    if (last && last.group === g) last.cols.push(c);
    else out.push({ group: g, cols: [c] });
  }
  return out;
}

export const pctCls = (pct: number | null) =>
  pct == null ? "text-neutral-300 dark:text-neutral-600" : pct >= 80 ? "text-rose-600 dark:text-rose-400 font-bold" : pct >= 60 ? "text-rose-500/80 dark:text-rose-300/80" : pct >= 40 ? "text-neutral-500" : "text-neutral-400 dark:text-neutral-500";
export const cellBg = (pct: number | null) => (pct == null ? "" : pct >= 80 ? "bg-rose-50 dark:bg-rose-500/10" : pct >= 60 ? "bg-rose-50/50 dark:bg-rose-500/5" : "");
