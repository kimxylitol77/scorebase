// 하키 (NHL/IIHF_WC) 팀 통계 비교 — TheSports detailLive.stats.
// stats = [[periodIdx, [[statId,home,away],...]], ...]. periodIdx 0=전체, 1~3=P1~P3, 4=OT, 5=SO.
// 탭으로 전체/피리어드별 전환. % 항목(7/10/12/13/16)은 0~1 비율 → ×100.

"use client";

import { useState } from "react";

const HOCKEY_STAT_LABELS: Record<number, { label: string; pct?: boolean }> = {
  6: { label: "유효 슈팅" },
  7: { label: "슈팅 성공률", pct: true },
  8: { label: "슛 블록" },
  9: { label: "선방" },
  10: { label: "선방률", pct: true },
  14: { label: "보디체크" },
  18: { label: "퍽 탈취" },
  19: { label: "퍽 내줌" },
  4: { label: "페널티" },
  11: { label: "페널티 분(PIM)" },
  2: { label: "파워플레이 골" },
  3: { label: "단신 골" },
  12: { label: "파워플레이 %", pct: true },
  13: { label: "페널티킬 %", pct: true },
  15: { label: "페이스오프 승" },
  16: { label: "페이스오프 %", pct: true },
  17: { label: "빈 골대 골" },
};
// 표시 순서: 공격(유효슛·성공률·블록) → 수비(선방) → 몸싸움(체크·탈취·내줌) → 페널티 → 페이스오프
const ORDER = [6, 7, 8, 9, 10, 14, 18, 19, 4, 11, 2, 3, 12, 13, 15, 16, 17];

export interface HockeyStatRow {
  statId: number;
  home: number;
  away: number;
}

export interface HockeyStatPeriod {
  /** 0=전체, 1~3=P1~P3, 4=OT, 5=SO */
  idx: number;
  rows: HockeyStatRow[];
}

interface Props {
  periods: HockeyStatPeriod[];
  homeNameKo: string;
  awayNameKo: string;
}

function periodLabel(idx: number): string {
  if (idx === 0) return "전체";
  if (idx <= 3) return `P${idx}`;
  if (idx === 4) return "OT";
  return "SO";
}

function fmt(v: number, pct?: boolean): string {
  if (pct) {
    const p = v * 100;
    return `${Number.isInteger(p) ? p : p.toFixed(1)}%`;
  }
  return String(v);
}

function Bar({ home, away }: { home: number; away: number }) {
  const max = Math.max(home, away, 0.0001);
  return (
    <div className="flex items-center gap-1 h-1.5">
      <div className="flex-1 flex justify-end">
        <div
          className="bg-rose-500 h-full rounded-l"
          style={{ width: `${(home / max) * 100}%`, transition: "width 0.4s" }}
        />
      </div>
      <div className="w-px h-3 bg-neutral-700" />
      <div className="flex-1">
        <div
          className="bg-blue-500 h-full rounded-r"
          style={{ width: `${(away / max) * 100}%`, transition: "width 0.4s" }}
        />
      </div>
    </div>
  );
}

export default function HockeyTeamStatsCard({ periods, homeNameKo, awayNameKo }: Props) {
  // 데이터 있는 피리어드만 + idx 오름차순 (전체 0 → P1 → P2 → P3 → OT → SO).
  const tabs = [...periods]
    .filter((p) => p.rows.length > 0)
    .sort((a, b) => a.idx - b.idx);
  // 전체(0) 우선 기본 선택, 없으면 첫 탭.
  const [selected, setSelected] = useState<number>(
    tabs.find((p) => p.idx === 0)?.idx ?? tabs[0]?.idx ?? 0,
  );

  if (tabs.length === 0) return null;
  const current = tabs.find((p) => p.idx === selected) ?? tabs[0];

  const byId = new Map(current.rows.map((r) => [r.statId, r]));
  const known = ORDER.map((id) => byId.get(id)).filter(
    (r): r is HockeyStatRow => !!r && HOCKEY_STAT_LABELS[r.statId] != null,
  );
  if (known.length === 0) return null;

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 p-4 sm:p-5">
      <header className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm sm:text-base font-bold tracking-tight">팀 통계</h2>
        <span className="text-[11px] text-neutral-500">TheSports</span>
      </header>

      {/* 피리어드 탭 */}
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-3">
          {tabs.map((p) => {
            const active = p.idx === current.idx;
            return (
              <button
                key={p.idx}
                type="button"
                onClick={() => setSelected(p.idx)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
                  active
                    ? "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300"
                    : "bg-neutral-100 dark:bg-neutral-800/60 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                {periodLabel(p.idx)}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2 text-xs">
        <div className="text-right text-rose-600 dark:text-rose-400 font-semibold truncate">
          {homeNameKo}
        </div>
        <div className="text-neutral-500">vs</div>
        <div className="text-left text-blue-600 dark:text-blue-400 font-semibold truncate">
          {awayNameKo}
        </div>
      </div>

      <ul className="space-y-2.5">
        {known.map((s) => {
          const meta = HOCKEY_STAT_LABELS[s.statId];
          return (
            <li key={s.statId}>
              <div className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-2 mb-0.5 text-xs">
                <span className="text-rose-600 dark:text-rose-400 font-bold tabular-nums text-right">
                  {fmt(s.home, meta.pct)}
                </span>
                <span className="text-center text-neutral-500 text-[11px]">{meta.label}</span>
                <span className="text-blue-600 dark:text-blue-400 font-bold tabular-nums text-left">
                  {fmt(s.away, meta.pct)}
                </span>
              </div>
              <Bar home={s.home} away={s.away} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
