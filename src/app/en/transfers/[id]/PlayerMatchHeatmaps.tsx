// 경기별 히트맵 (영어판). scripts/en-mirror 로 자동 생성.
"use client";
// 히트맵 탭 — 경기별 원시 터치 좌표(TheStatsAPI) 기반. 직전 경기/최근 5경기/시즌 전체 칩 + 개별 경기 드롭다운.
// 합산 뷰는 저장된 경기별 좌표를 클라에서 합쳐 렌더 (추가 API 호출 없음).

import { useMemo, useState } from "react";
import HeatPitch, { type HeatPoint } from "./HeatPitch";
import { MetricBar, type PlayerHeatmapData } from "./PlayerHeatmapAnalysis";

export interface MatchHeatmapRow {
  id: string;
  date: string; // YYYY-MM-DD
  opp: string;
  ha: "H" | "A";
  score: string;
  result: "W" | "D" | "L";
  points: Array<[number, number]>;
}

const RESULT_KO = { W: "W", D: "D", L: "L" } as const;
const RESULT_CLS = {
  W: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  D: "bg-neutral-500/15 text-neutral-500 dark:text-neutral-400",
  L: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
} as const;

function matchLabel(m: MatchHeatmapRow): string {
  const [, mm, dd] = m.date.split("-");
  return `${Number(mm)}/${Number(dd)} ${m.opp} (${m.ha === "H" ? "H" : "A"}) ${m.score} ${RESULT_KO[m.result]}`;
}

export default function PlayerMatchHeatmaps({
  name,
  seasonLabel,
  matches,
  seasonData,
}: {
  name: string;
  seasonLabel: string;
  matches: MatchHeatmapRow[];
  seasonData: PlayerHeatmapData | null;
}) {
  // view: "last" | "last5" | "season" | 개별 경기 id
  const [view, setView] = useState<string>("last");

  // 현재 뷰 좌표에서 3선 분포·평균 전진 위치를 가중 계산 (시즌 카드와 동일 지표)
  const zoneStats = (pts: HeatPoint[]) => {
    let total = 0, sx = 0, def = 0, mid = 0, att = 0;
    for (const p of pts) {
      const w = p.w ?? 1;
      total += w; sx += p.x * w;
      if (p.x < 100 / 3) def += w; else if (p.x < 200 / 3) mid += w; else att += w;
    }
    return total === 0
      ? { avgX: 0, defPct: 0, midPct: 0, attPct: 0 }
      : { avgX: sx / total, defPct: (def / total) * 100, midPct: (mid / total) * 100, attPct: (att / total) * 100 };
  };

  const { points, contextLabel, touches, fixedStats } = useMemo(() => {
    if (view === "season" && seasonData) {
      // 시즌 뷰 지표는 카드와 동일한 정밀 요약값 사용 — 10x10 셀 재계산은 경계 배분이 어긋난다
      const s = seasonData.summary;
      return {
        points: seasonData.cells.map((c): HeatPoint => ({ x: c.x + 5, y: c.y + 5, w: c.count })),
        contextLabel: `${seasonLabel} full season`,
        touches: s.weightedPoints,
        fixedStats: { avgX: s.averageX, defPct: s.defensiveThirdPct, midPct: s.middleThirdPct, attPct: s.attackingThirdPct },
      };
    }
    if (view === "last5") {
      const recent = matches.slice(0, 5);
      return {
        points: recent.flatMap((m) => m.points.map(([x, y]): HeatPoint => ({ x, y }))),
        contextLabel: `Last ${recent.length} matches combined`,
        touches: recent.reduce((a, m) => a + m.points.length, 0),
        fixedStats: null,
      };
    }
    const m = view === "last" ? matches[0] : matches.find((r) => r.id === view) ?? matches[0];
    return {
      points: m.points.map(([x, y]): HeatPoint => ({ x, y })),
      contextLabel: matchLabel(m),
      touches: m.points.length,
      fixedStats: null,
    };
  }, [view, matches, seasonData, seasonLabel]);

  const chips: Array<{ key: string; label: string }> = [
    { key: "last", label: "Most recent match" },
    ...(matches.length >= 2 ? [{ key: "last5", label: `Last ${Math.min(5, matches.length)} matches` }] : []),
    ...(seasonData ? [{ key: "season", label: "Full season" }] : []),
  ];
  const isChipActive = (key: string) => view === key || (key === "last" && view === matches[0]?.id);

  return (
    <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-4 py-4 dark:border-white/10 sm:px-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Heatmap</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">Match by match heatmaps</h2>
        </div>
        <div className="text-right text-xs text-neutral-500 dark:text-neutral-400">
          <div className="font-semibold text-neutral-700 dark:text-neutral-200">{seasonLabel}</div>
          <div className="mt-0.5 tabular-nums">with data {matches.length} matches</div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              onClick={() => setView(c.key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                isChipActive(c.key)
                  ? "bg-emerald-600 text-white dark:bg-emerald-500"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
              }`}
            >
              {c.label}
            </button>
          ))}
          <select
            value={view === "last" || view === "last5" || view === "season" ? "" : view}
            onChange={(e) => e.target.value && setView(e.target.value)}
            aria-label="Select a match"
            className="ml-auto max-w-[240px] rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-200"
          >
            <option value="">Select a match…</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>{matchLabel(m)}</option>
            ))}
          </select>
        </div>

        <HeatPitch points={points} ariaLabel={`${name} ${contextLabel} heatmap`} />

        <div className="flex items-center justify-between gap-3 text-[11px] text-neutral-500">
          <span>Low</span>
          <span
            className="h-1.5 flex-1 rounded-full"
            style={{ background: "linear-gradient(to right, #1c4a2a, #a8e03c 30%, #fcdc30 55%, #fc821c 78%, #e22628)" }}
          />
          <span>High</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="font-semibold text-neutral-700 dark:text-neutral-200">{contextLabel}</span>
          {view !== "season" && view !== "last5" && (() => {
            const m = view === "last" ? matches[0] : matches.find((r) => r.id === view);
            return m ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${RESULT_CLS[m.result]}`}>{RESULT_KO[m.result]}</span>
            ) : null;
          })()}
        </div>

        {(() => {
          const s = fixedStats ?? zoneStats(points);
          return (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
                  <div className="text-lg font-black tabular-nums">{Math.round(s.attPct)}%</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">Final third</div>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
                  <div className="text-lg font-black tabular-nums">{s.avgX.toFixed(1)}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">Average position</div>
                </div>
                <div className="rounded-lg bg-neutral-50 px-2 py-2.5 dark:bg-white/[0.04]">
                  <div className="text-lg font-black tabular-nums">{touches.toLocaleString()}</div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">Touches</div>
                </div>
              </div>
              <div className="space-y-3">
                <MetricBar label="Defensive third" value={s.defPct} accent="bg-emerald-500" />
                <MetricBar label="Middle third" value={s.midPct} accent="bg-amber-400" />
                <MetricBar label="Attacking third" value={s.attPct} accent="bg-red-500" />
              </div>
            </>
          );
        })()}
      </div>

      <p className="border-t border-black/5 px-4 py-3 text-[10px] leading-4 text-neutral-400 dark:border-white/10 sm:px-5">
        Per-match touch coordinates from TheStatsAPI. Only matches with heatmap data are listed.
      </p>
    </section>
  );
}
