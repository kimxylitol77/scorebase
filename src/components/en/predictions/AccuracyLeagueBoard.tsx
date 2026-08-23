// predictions__AccuracyLeagueBoard (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";
// 리그별 적중률 보드 — 기간(누적·30·14·7일) × 시장(1X2·DC·OU·핸디·BTTS·Strong) 교차 필터.
// 집계는 서버(accuracy-stats)에서 전 기간 미리 계산해 넘겨받고, 여기서는 선택만 한다.
import { useState } from "react";
import Link from "next/link";
import LeagueBadge from "@/components/en/LeagueBadge";
import type {
  MarketRate,
  WindowKey,
  WindowStat,
} from "@/lib/predict/accuracy-stats";

export interface AccuracyLeagueRow {
  league: string;
  name: string;
  isSoccer: boolean;
  windows: Record<WindowKey, WindowStat>;
}

const WINDOW_TABS: { key: WindowKey; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "d30", label: "Last 30 days" },
  { key: "d14", label: "Last 14 days" },
  { key: "d7", label: "Last 7 days" },
];

export default function AccuracyLeagueBoard({
  leagues,
  minSample,
}: {
  leagues: AccuracyLeagueRow[];
  minSample: number;
}) {
  const [win, setWin] = useState<WindowKey>("all");

  const rows = leagues
    .map((l) => ({ ...l, w: l.windows[win] }))
    .filter((l) => l.w.oneXTwo.evaluated > 0)
    .sort((a, b) => b.w.oneXTwo.rate - a.w.oneXTwo.rate);
  const hidden = leagues.length - rows.length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/[0.06]">
          {WINDOW_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setWin(t.key)}
              aria-pressed={win === t.key}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                win === t.key
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-white/[0.14] dark:text-white"
                  : "text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-neutral-500">
          Changing the window updates every market, not just 1X2.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <LeagueCard
            key={r.league}
            league={r.league}
            name={r.name}
            isSoccer={r.isSoccer}
            stat={r.w}
            minSample={minSample}
          />
        ))}
      </div>

      {rows.length === 0 && (
        <p className="rounded-2xl bg-neutral-100 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-white/[0.04]">
          No matches were scored in this window. Try a longer period.
        </p>
      )}
      {hidden > 0 && rows.length > 0 && (
        <p className="mt-4 text-xs text-neutral-500">
          Leagues with no scored matches in this window {hidden}are hidden.
        </p>
      )}
    </>
  );
}

function LeagueCard({
  league,
  name,
  isSoccer,
  stat,
  minSample,
}: {
  league: string;
  name: string;
  isSoccer: boolean;
  stat: WindowStat;
  minSample: number;
}) {
  const main = stat.oneXTwo;
  const pct = Math.round(main.rate * 100);
  const thin = main.evaluated < minSample; // 소표본 — 수치는 보여주되 경고 병기

  return (
    <Link
      href={`/leagues/${league}`}
      className="block rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none dark:hover:bg-white/[0.06]"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LeagueBadge league={league} />
          <span className="text-sm font-semibold">{name}</span>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold tabular-nums">
            {pct}
            <span className="text-sm text-neutral-500">%</span>
          </div>
          <div className="text-[10px] text-neutral-400 tabular-nums">
            1X2 · {main.correct}/{main.evaluated}
          </div>
        </div>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* 시장별 chip — 축구는 DC·BTTS 포함, 그 외 종목은 해당 시장 자체가 없음 */}
      <div className="grid grid-cols-3 gap-1.5 text-[11px]">
        {isSoccer && <MarketChip label="DC" rate={stat.dc} />}
        <MarketChip label="OVER" rate={stat.over} />
        <MarketChip label="Handicap" rate={stat.hc} />
        {isSoccer && <MarketChip label="BTTS" rate={stat.btts} />}
        <MarketChip label="Strong" rate={stat.strong} />
      </div>

      {thin && (
        <p className="mt-3 text-[10px] text-amber-600 dark:text-amber-400">
          Sample {main.evaluated} — {minSample} or fewer, so the figure may swing.
        </p>
      )}
    </Link>
  );
}

function MarketChip({ label, rate }: { label: string; rate: MarketRate }) {
  return (
    <div className="rounded-lg bg-neutral-100 px-2 py-1.5 dark:bg-white/[0.06]">
      <div className="text-[10px] text-neutral-500">{label}</div>
      {rate.evaluated === 0 ? (
        <div className="text-sm font-bold text-neutral-400">—</div>
      ) : (
        <>
          <div className="text-sm font-bold tabular-nums text-neutral-900 dark:text-white">
            {Math.round(rate.rate * 100)}%
          </div>
          <div className="text-[10px] tabular-nums text-neutral-400">
            {rate.correct}/{rate.evaluated}
          </div>
        </>
      )}
    </div>
  );
}
