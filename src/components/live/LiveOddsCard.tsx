// 라이브 odds 카드 — 1X2 / OVER-UNDER / 핸디캡 + (선택) Elo 예측 비교 + 북메이커별 표.
// `/api/live/match` 응답의 liveOdds 필드 사용 (1분 캐시).
// hasDraw=true 일 때만 1X2 의 X (무승부) 칼럼 표시.

"use client";

import { useState } from "react";

interface BookmakerEntry {
  key: string;
  title: string;
  h2h: { home: number; draw: number | null; away: number } | null;
}

interface LiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  bookmakerList?: BookmakerEntry[];
  fetchedAt: number;
}

interface Props {
  odds: LiveOdds;
  homeNameKo: string;
  awayNameKo: string;
  hasDraw?: boolean;
  /** 우리 Elo 예측 확률 (0~1). 있으면 implied 와 비교해 value % 표시 */
  eloPrediction?: {
    home: number;
    draw?: number | null;
    away: number;
  } | null;
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(2);
}

function timeAgo(epoch: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - epoch) / 1000));
  if (sec < 60) return `${sec}초 전`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  return `${Math.floor(min / 60)}시간 전`;
}

/** vig 미제거 implied probability (decimal odds 의 역수). 정규화 안 함. */
function implied(odds: number | null | undefined): number | null {
  if (odds == null || odds <= 0) return null;
  return 1 / odds;
}

/** vig 합 (1X2 implied 합 - 1) — 북메이커 마진 */
function calcVig(h2h: LiveOdds["h2h"]): number | null {
  if (!h2h) return null;
  const ih = implied(h2h.home);
  const ia = implied(h2h.away);
  if (ih == null || ia == null) return null;
  const id = h2h.draw != null ? implied(h2h.draw) : 0;
  if (id == null) return null;
  const sum = ih + ia + id;
  return sum - 1;
}

/** vig 제거 후 정규화 implied % */
function normalizedImplied(odds: number | null, total: number): number | null {
  const i = implied(odds);
  if (i == null || total <= 0) return null;
  return i / total;
}

export default function LiveOddsCard({
  odds,
  homeNameKo,
  awayNameKo,
  hasDraw,
  eloPrediction,
}: Props) {
  const { h2h, totals, spread, bookmakers, bookmakerList, fetchedAt } = odds;
  const [expanded, setExpanded] = useState(false);

  if (!h2h && !totals && !spread) return null;

  // implied % (vig 제거 후 정규화)
  const vig = calcVig(h2h);
  const totalImplied = h2h
    ? (implied(h2h.home) ?? 0) +
      (h2h.draw != null ? (implied(h2h.draw) ?? 0) : 0) +
      (implied(h2h.away) ?? 0)
    : 0;
  const impH = h2h ? normalizedImplied(h2h.home, totalImplied) : null;
  const impD = h2h?.draw != null ? normalizedImplied(h2h.draw, totalImplied) : null;
  const impA = h2h ? normalizedImplied(h2h.away, totalImplied) : null;

  // Elo vs implied — value = elo% - implied%. 양수면 우리 모델이 배당사보다 높은 확률.
  const valH =
    eloPrediction && impH != null ? (eloPrediction.home - impH) * 100 : null;
  const valA =
    eloPrediction && impA != null ? (eloPrediction.away - impA) * 100 : null;
  const valD =
    eloPrediction?.draw != null && impD != null
      ? (eloPrediction.draw - impD) * 100
      : null;

  const valueColor = (v: number | null) =>
    v == null
      ? "text-neutral-400"
      : v > 3
        ? "text-emerald-600 dark:text-emerald-400"
        : v < -3
          ? "text-rose-600 dark:text-rose-400"
          : "text-neutral-500";

  const valueText = (v: number | null) =>
    v == null ? "" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

  // 북메이커 sorted by title
  const sortedBMs = (bookmakerList ?? [])
    .filter((b) => b.h2h)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-4 sm:p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">
          라이브 배당 (1분 갱신)
        </div>
        <div className="text-[10px] text-neutral-400">
          {bookmakers}개 북메이커 평균 · {timeAgo(fetchedAt)}
        </div>
      </div>

      {/* 1X2 — implied % + Elo 비교 */}
      {h2h && (
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] text-neutral-500">
              {hasDraw ? "승무패 (1X2)" : "승부 (머니라인)"}
            </div>
            {vig != null && (
              <div className="text-[10px] text-neutral-400">
                vig {(vig * 100).toFixed(1)}%
              </div>
            )}
          </div>
          <div
            className={`grid ${hasDraw && h2h.draw != null ? "grid-cols-3" : "grid-cols-2"} gap-2`}
          >
            <OddsCellRich
              label={homeNameKo}
              value={h2h.home}
              implied={impH}
              eloPct={eloPrediction?.home ?? null}
              valuePct={valH}
              valueColor={valueColor(valH)}
              valueText={valueText(valH)}
            />
            {hasDraw && h2h.draw != null && (
              <OddsCellRich
                label="무"
                value={h2h.draw}
                implied={impD}
                eloPct={eloPrediction?.draw ?? null}
                valuePct={valD}
                valueColor={valueColor(valD)}
                valueText={valueText(valD)}
              />
            )}
            <OddsCellRich
              label={awayNameKo}
              value={h2h.away}
              implied={impA}
              eloPct={eloPrediction?.away ?? null}
              valuePct={valA}
              valueColor={valueColor(valA)}
              valueText={valueText(valA)}
            />
          </div>
        </div>
      )}

      {totals && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500">
            총득점 OVER/UNDER (기준 {totals.line})
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OddsCell label={`O ${totals.line}`} value={totals.over} />
            <OddsCell label={`U ${totals.line}`} value={totals.under} />
          </div>
        </div>
      )}

      {spread && (
        <div className="space-y-1">
          <div className="text-[10px] text-neutral-500">
            핸디캡 (
            {spread.pick === "HOME" ? homeNameKo : awayNameKo} -{spread.line})
          </div>
          <div className="grid grid-cols-2 gap-2">
            <OddsCell
              label={
                spread.pick === "HOME"
                  ? `${homeNameKo} -${spread.line}`
                  : `${homeNameKo} +${spread.line}`
              }
              value={spread.homeOdds}
            />
            <OddsCell
              label={
                spread.pick === "AWAY"
                  ? `${awayNameKo} -${spread.line}`
                  : `${awayNameKo} +${spread.line}`
              }
              value={spread.awayOdds}
            />
          </div>
        </div>
      )}

      {/* 북메이커별 표 — 펼치기 */}
      {sortedBMs.length > 0 && (
        <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
          >
            <span>
              북메이커별 1X2 비교 ({sortedBMs.length}개)
            </span>
            <span className={`transition-transform ${expanded ? "rotate-180" : ""}`}>▼</span>
          </button>
          {expanded && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-neutral-400 border-b border-neutral-100 dark:border-neutral-800">
                    <th className="text-left py-1.5 pr-2 font-normal">북메이커</th>
                    <th className="text-right py-1.5 px-1 font-normal w-12">홈</th>
                    {hasDraw && <th className="text-right py-1.5 px-1 font-normal w-12">무</th>}
                    <th className="text-right py-1.5 px-1 font-normal w-12">원정</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBMs.map((b) => (
                    <tr
                      key={b.key}
                      className="border-b border-neutral-50 dark:border-neutral-900/50"
                    >
                      <td className="py-1.5 pr-2 truncate text-neutral-700 dark:text-neutral-300">
                        {b.title}
                      </td>
                      <td className="text-right py-1.5 px-1 font-semibold">
                        {fmt(b.h2h?.home)}
                      </td>
                      {hasDraw && (
                        <td className="text-right py-1.5 px-1">
                          {fmt(b.h2h?.draw ?? null)}
                        </td>
                      )}
                      <td className="text-right py-1.5 px-1 font-semibold">
                        {fmt(b.h2h?.away)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OddsCell({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 flex flex-col items-center">
      <div className="text-[11px] text-neutral-500 truncate max-w-full">{label}</div>
      <div className="text-base font-bold tabular-nums">{fmt(value)}</div>
    </div>
  );
}

function OddsCellRich({
  label,
  value,
  implied,
  eloPct,
  valuePct: _valuePct,
  valueColor,
  valueText,
}: {
  label: string;
  value: number | null | undefined;
  implied: number | null;
  eloPct: number | null;
  valuePct: number | null;
  valueColor: string;
  valueText: string;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 px-3 py-2 flex flex-col items-center">
      <div className="text-[11px] text-neutral-500 truncate max-w-full">{label}</div>
      <div className="text-base font-bold tabular-nums">{fmt(value)}</div>
      <div className="text-[9px] text-neutral-400 tabular-nums">
        배당사 {implied != null ? `${(implied * 100).toFixed(0)}%` : "—"}
      </div>
      {eloPct != null && (
        <div className="text-[9px] tabular-nums flex items-baseline gap-1">
          <span className="text-neutral-400">Elo {(eloPct * 100).toFixed(0)}%</span>
          <span className={`font-bold ${valueColor}`}>{valueText}</span>
        </div>
      )}
    </div>
  );
}
