// 라이브 odds 카드 — 1X2 / OVER-UNDER / 핸디캡 + (선택) Elo 예측 비교 + 북메이커별 표.
// `/api/live/match` 응답의 liveOdds 필드 사용 (1분 캐시).
// hasDraw=true 일 때만 1X2 의 X (무승부) 칼럼 표시.

"use client";

import { useState } from "react";
import { useClientValue } from "@/lib/use-client-value";

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

interface OddsHistoryPoint {
  fetchedAt: number;
  home: number;
  draw: number | null;
  away: number;
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
  /** 시계열 — sparkline 차트용 (오래된→최신). 비어있으면 차트 미표시 */
  oddsHistory?: OddsHistoryPoint[];
  /** 매치 상태 — FINISHED 면 "경기 전 최종"으로 표기해 오래된 값이 현재처럼 보이지 않게 함. */
  matchStatus?: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
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

/** 배당 신선도 — 갱신 후 경과시간으로 🟢<2분 / 🟡<30분 / 🔴 그 외(지연). */
function freshnessLabel(epoch: number): { dot: string; text: string; cls: string } {
  const min = Math.floor(Math.max(0, Date.now() - epoch) / 60000);
  const ago = timeAgo(epoch);
  if (min < 2) return { dot: "🟢", text: ago, cls: "text-emerald-600 dark:text-emerald-400" };
  if (min < 30) return { dot: "🟡", text: ago, cls: "text-amber-600 dark:text-amber-400" };
  return { dot: "🔴", text: `${ago} · 지연`, cls: "text-rose-600 dark:text-rose-400" };
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
  oddsHistory,
  matchStatus,
}: Props) {
  const { h2h, totals, spread, bookmakers, bookmakerList, fetchedAt } = odds;
  const [expanded, setExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<"title" | "home" | "draw" | "away">("title");
  // 경과시간("n초 전")은 SSR 시각과 하이드레이션 시각이 달라 텍스트가 어긋난다.
  // React 19 는 mismatch 시 루트 전체를 재렌더해 테마(html.dark)까지 되돌리므로
  // 마운트 후에만 표시한다.
  const mounted = useClientValue(() => true, false);

  if (!h2h && !totals && !spread) return null;

  const isFinished = matchStatus === "FINISHED";
  const fresh = freshnessLabel(fetchedAt);

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
  // 정렬 — 기본 이름순, 칼럼 헤더 클릭으로 홈/무/원정 배당 내림차순 (라인쇼핑: 최고가 맨 위)
  const sortedBMs = (bookmakerList ?? [])
    .filter((b) => b.h2h)
    .sort((a, b) =>
      sortKey === "title"
        ? a.title.localeCompare(b.title)
        : ((b.h2h?.[sortKey] ?? 0) - (a.h2h?.[sortKey] ?? 0)) || a.title.localeCompare(b.title),
    );
  // 칼럼별 최고 배당 + 최고-최저 스프레드 (%) — "여기가 제일 좋다"를 0.5초 안에
  const colMax = (k: "home" | "draw" | "away") =>
    sortedBMs.reduce((m, b) => Math.max(m, b.h2h?.[k] ?? 0), 0);
  const colMin = (k: "home" | "draw" | "away") =>
    sortedBMs.reduce((m, b) => (b.h2h?.[k] != null ? Math.min(m, b.h2h[k]!) : m), Infinity);
  const bestHome = colMax("home");
  const bestDraw = colMax("draw");
  const bestAway = colMax("away");
  const spreadPct = (k: "home" | "draw" | "away") => {
    const mx = colMax(k);
    const mn = colMin(k);
    return mx > 0 && Number.isFinite(mn) && mn > 0 ? ((mx - mn) / mn) * 100 : null;
  };
  const bestCls = "bg-emerald-100/70 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 rounded-md";
  const subSummaryCls =
    "flex cursor-pointer select-none items-center gap-1.5 px-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400 list-none [&::-webkit-details-marker]:hidden hover:text-neutral-800 dark:hover:text-neutral-200";
  const thSort = (k: "home" | "draw" | "away", label: string) => (
    <th className="text-right py-2 px-1.5 font-medium w-16">
      <button
        type="button"
        onClick={() => setSortKey((cur) => (cur === k ? "title" : k))}
        aria-label={`${label} 배당 ${sortKey === k ? "정렬 해제" : "높은 순 정렬"}`}
        className={`hover:underline ${sortKey === k ? "text-neutral-800 dark:text-neutral-100 font-semibold" : ""}`}
      >
        {label}{sortKey === k ? " ↓" : ""}
      </button>
    </th>
  );

  return (
    <details open className="group/card rounded-[28px] bg-neutral-100/70 dark:bg-white/[0.04] ring-1 ring-black/5 dark:ring-white/10 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-8px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_32px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl p-5 sm:p-6 [&[open]]:space-y-5">
      {/* 헤더 — status 인지 라벨 + freshness 배지. 카드 전체 접기/펼치기 (2026-08-23 사용자) */}
      <summary className="flex cursor-pointer select-none items-center justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400 transition-transform group-open/card:rotate-90" aria-hidden>▶</span>
          {!isFinished && (
            <span className="relative inline-flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-60" />
              <span className="relative inline-block w-2 h-2 rounded-full bg-rose-500" />
            </span>
          )}
          <span className="text-[13px] font-semibold tracking-tight text-neutral-900 dark:text-white">
            {isFinished ? "경기 전 최종 배당" : "실시간 배당"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] tabular-nums">
          <span className="text-neutral-500 dark:text-neutral-400" title="실시간 폴링에 응답한 북메이커만 평균 — 경기 전 평균(25곳)과 표본이 다릅니다">{bookmakers}곳 실시간 평균</span>
          {isFinished ? (
            <span className="rounded-full bg-neutral-200/70 dark:bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
              경기 전 최종
            </span>
          ) : mounted ? (
            <span className={`font-medium ${fresh.cls}`}>
              {fresh.dot} {fresh.text}
            </span>
          ) : null}
        </div>
      </summary>

      {/* 1X2 — implied % + Elo 비교 */}
      {h2h && (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              {hasDraw ? "승무패" : "머니라인"}
            </div>
            {vig != null && (
              <div className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
                마진 {(vig * 100).toFixed(1)}%
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
        <details className="group/t">
          <summary className={subSummaryCls}>
            <span className="text-[10px] text-neutral-400 transition-transform group-open/t:rotate-90" aria-hidden>▶</span>
            총득점 <span className="text-neutral-400 dark:text-neutral-500">· 기준 {totals.line} · 오버 {fmt(totals.over)} / 언더 {fmt(totals.under)}</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <OddsCell label={`오버 ${totals.line}`} value={totals.over} />
            <OddsCell label={`언더 ${totals.line}`} value={totals.under} />
          </div>
        </details>
      )}

      {spread && (
        <details className="group/s">
          <summary className={subSummaryCls}>
            <span className="text-[10px] text-neutral-400 transition-transform group-open/s:rotate-90" aria-hidden>▶</span>
            핸디캡 <span className="text-neutral-400 dark:text-neutral-500">· {spread.pick === "HOME" ? homeNameKo : awayNameKo} −{spread.line} · {fmt(spread.homeOdds)} / {fmt(spread.awayOdds)}</span>
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <OddsCell
              label={
                spread.pick === "HOME"
                  ? `${homeNameKo} −${spread.line}`
                  : `${homeNameKo} +${spread.line}`
              }
              value={spread.homeOdds}
            />
            <OddsCell
              label={
                spread.pick === "AWAY"
                  ? `${awayNameKo} −${spread.line}`
                  : `${awayNameKo} +${spread.line}`
              }
              value={spread.awayOdds}
            />
          </div>
        </details>
      )}

      {/* Sparkline — 30 snapshot 시계열 (최대 3h). 기본 접힘 */}
      {oddsHistory && oddsHistory.length >= 2 && (
        <details className="group/h rounded-2xl bg-white/70 dark:bg-white/[0.03] ring-1 ring-black/5 dark:ring-white/5 p-4 [&[open]]:space-y-2.5">
          <summary className="flex cursor-pointer select-none items-baseline justify-between gap-2 list-none [&::-webkit-details-marker]:hidden">
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              <span className="inline-block text-[10px] text-neutral-400 transition-transform group-open/h:rotate-90 mr-1" aria-hidden>▶</span>
              {isFinished ? "경기 전 배당 흐름" : "배당 흐름"} · {oddsHistory.length}개 snapshot
            </div>
            <SparklineLegend
              hasDraw={hasDraw}
              homeNameKo={homeNameKo}
              awayNameKo={awayNameKo}
              first={oddsHistory[0]}
              last={oddsHistory[oddsHistory.length - 1]}
            />
          </summary>
          <Sparklines
            points={oddsHistory}
            hasDraw={hasDraw}
            homeNameKo={homeNameKo}
            awayNameKo={awayNameKo}
          />
        </details>
      )}

      {/* 북메이커별 표 — 펼치기 */}
      {sortedBMs.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between rounded-full bg-white/60 dark:bg-white/[0.05] hover:bg-white dark:hover:bg-white/[0.08] ring-1 ring-black/5 dark:ring-white/10 px-4 py-2.5 text-[12px] font-medium text-neutral-700 dark:text-neutral-300 transition"
          >
            <span>
              북메이커별 비교 · {sortedBMs.length}곳
              {spreadPct("home") != null && (
                <span className="ml-2 text-[10px] text-neutral-500">
                  최고−최저 홈 {spreadPct("home")!.toFixed(0)}% · 원정 {spreadPct("away")!.toFixed(0)}%
                </span>
              )}
            </span>
            <span className={`text-neutral-400 transition-transform ${expanded ? "rotate-180" : ""}`}>
              ⌃
            </span>
          </button>
          {expanded && (
            <div className="mt-2 overflow-x-auto rounded-2xl bg-white/60 dark:bg-white/[0.03] ring-1 ring-black/5 dark:ring-white/5 p-3">
              <table className="w-full text-[12px] tabular-nums">
                <thead>
                  <tr className="text-neutral-400 dark:text-neutral-500 border-b border-black/5 dark:border-white/5">
                    <th className="text-left py-2 pr-2 font-medium">북메이커</th>
                    {thSort("home", "홈")}
                    {hasDraw && thSort("draw", "무")}
                    {thSort("away", "원정")}
                  </tr>
                </thead>
                <tbody>
                  {sortedBMs.map((b) => (
                    <tr
                      key={b.key}
                      className="border-b border-black/5 dark:border-white/5 last:border-b-0"
                    >
                      <td className="py-2 pr-2 truncate text-neutral-700 dark:text-neutral-200">
                        {b.title}
                      </td>
                      <td className={`text-right py-2 px-1.5 font-semibold text-neutral-900 dark:text-white ${b.h2h?.home === bestHome ? bestCls : ""}`} title={b.h2h?.home === bestHome ? "최고 배당" : undefined}>
                        {fmt(b.h2h?.home)}
                      </td>
                      {hasDraw && (
                        <td className={`text-right py-2 px-1.5 text-neutral-600 dark:text-neutral-300 ${b.h2h?.draw != null && b.h2h.draw === bestDraw ? bestCls : ""}`} title={b.h2h?.draw === bestDraw ? "최고 배당" : undefined}>
                          {fmt(b.h2h?.draw ?? null)}
                        </td>
                      )}
                      <td className={`text-right py-2 px-1.5 font-semibold text-neutral-900 dark:text-white ${b.h2h?.away === bestAway ? bestCls : ""}`} title={b.h2h?.away === bestAway ? "최고 배당" : undefined}>
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
    </details>
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
    <div className="rounded-2xl bg-white/80 dark:bg-white/[0.06] ring-1 ring-black/5 dark:ring-white/10 px-4 py-3.5 flex flex-col items-center gap-1">
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-full">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">
        {fmt(value)}
      </div>
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
  const hasValueBadge = eloPct != null && valueText !== "";
  return (
    <div className="rounded-2xl bg-white/80 dark:bg-white/[0.06] ring-1 ring-black/5 dark:ring-white/10 px-3 py-3 flex flex-col items-center gap-1 relative">
      {/* value 배지 — 셀 우측 상단 */}
      {hasValueBadge && (
        <span
          className={`absolute top-2 right-2 text-[9px] font-bold tabular-nums rounded-full px-1.5 py-0.5 ${
            valueColor.includes("emerald")
              ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : valueColor.includes("rose")
                ? "bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300"
                : "bg-neutral-100 dark:bg-white/10 text-neutral-500 dark:text-neutral-400"
          }`}
        >
          {valueText}
        </span>
      )}
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-full">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900 dark:text-white">
        {fmt(value)}
      </div>
      <div className="flex items-center gap-2 text-[10px] tabular-nums mt-0.5">
        {implied != null && (
          <span className="text-neutral-400 dark:text-neutral-500">
            배당사 <span className="font-semibold text-neutral-600 dark:text-neutral-300">{(implied * 100).toFixed(0)}%</span>
          </span>
        )}
        {eloPct != null && (
          <span className="text-neutral-400 dark:text-neutral-500">
            모델 <span className="font-semibold text-neutral-600 dark:text-neutral-300">{(eloPct * 100).toFixed(0)}%</span>
          </span>
        )}
      </div>
    </div>
  );
}

/** 1X2 배당 변동 차트 — home/draw/away 3 라인 + y축 배당 눈금 + x축 시각 + 끝점 현재값.
 * y축 = odds (내려갈수록 승리확률 ↑). draw 는 hasDraw(축구) 일 때만. */
function Sparklines({
  points,
  hasDraw,
  homeNameKo,
  awayNameKo,
}: {
  points: OddsHistoryPoint[];
  hasDraw?: boolean;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const W = 560;
  const H = 190;
  const padL = 12;
  const padR = 50;
  const padT = 12;
  const padB = 20;
  const n = points.length;
  if (n < 2) return null;

  const series: { key: "home" | "draw" | "away"; color: string; name: string }[] = [
    { key: "home", color: "#f43f5e", name: homeNameKo },
    ...(hasDraw ? [{ key: "draw" as const, color: "#94a3b8", name: "무" }] : []),
    { key: "away", color: "#3b82f6", name: awayNameKo },
  ];
  const val = (p: OddsHistoryPoint, key: "home" | "draw" | "away") =>
    key === "draw" ? p.draw : p[key];

  // y 범위 — 전체 odds min/max (위아래 10% 여백)
  const allOdds: number[] = [];
  for (const p of points)
    for (const s of series) {
      const v = val(p, s.key);
      if (v != null) allOdds.push(v);
    }
  const minY = Math.min(...allOdds);
  const maxY = Math.max(...allOdds);
  const rangeY = maxY - minY || 1;
  const y0 = minY - rangeY * 0.1;
  const y1 = maxY + rangeY * 0.1;
  const rY = y1 - y0;

  const xOf = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const yOf = (v: number) => padT + (1 - (v - y0) / rY) * (H - padT - padB);
  const line = (key: "home" | "draw" | "away") =>
    points
      .map((p, i) => {
        const v = val(p, key);
        if (v == null) return "";
        return `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" ");

  // KST 고정 표기 — 로컬 시간대(getHours 등)를 쓰면 Vercel(UTC) SSR 과 브라우저(KST)
  // 출력이 달라져 hydration mismatch → React 가 루트 재렌더하며 테마(html.dark)까지
  // 되돌리는 사고가 났다 (라이트 모드가 새로고침마다 다크로 뒤집힘).
  const fmtTime = (ms: number) => {
    const d = new Date(ms + 9 * 3600 * 1000); // UTC+9
    const p2 = (x: number) => String(x).padStart(2, "0");
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }}>
      {/* y 눈금 — min/max 수평선 + 배당값 */}
      {[minY, maxY].map((v) => (
        <g key={v}>
          <line
            x1={padL}
            x2={W - padR}
            y1={yOf(v)}
            y2={yOf(v)}
            className="stroke-neutral-200 dark:stroke-neutral-700"
            strokeWidth="0.5"
          />
          <text x={padL} y={yOf(v) - 3} className="fill-neutral-400 dark:fill-neutral-500" fontSize="9">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      {/* x 시각 — 첫/끝 */}
      <text x={padL} y={H - 5} className="fill-neutral-400 dark:fill-neutral-500" fontSize="9">
        {fmtTime(points[0].fetchedAt)}
      </text>
      <text
        x={W - padR}
        y={H - 5}
        textAnchor="end"
        className="fill-neutral-400 dark:fill-neutral-500"
        fontSize="9"
      >
        {fmtTime(points[n - 1].fetchedAt)}
      </text>
      {/* 라인 + 끝점 dot + 현재 배당값 */}
      {series.map((s) => {
        const lastV = val(points[n - 1], s.key);
        return (
          <g key={s.key}>
            <path
              d={line(s.key)}
              fill="none"
              stroke={s.color}
              strokeWidth="1.8"
              strokeDasharray={s.key === "draw" ? "3,2" : undefined}
            />
            {lastV != null && (
              <>
                <circle cx={xOf(n - 1)} cy={yOf(lastV)} r="2.5" fill={s.color} />
                <text x={W - padR + 5} y={yOf(lastV) + 3} fontSize="10" fontWeight="600" fill={s.color}>
                  {lastV.toFixed(2)}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SparklineLegend({
  hasDraw,
  homeNameKo,
  awayNameKo,
  first,
  last,
}: {
  hasDraw?: boolean;
  homeNameKo: string;
  awayNameKo: string;
  first: OddsHistoryPoint;
  last: OddsHistoryPoint;
}) {
  const arrow = (a: number, b: number) => {
    const diff = b - a;
    if (Math.abs(diff) < 0.05) return { txt: "→", color: "text-neutral-400" };
    return diff < 0
      ? { txt: "↓", color: "text-emerald-600 dark:text-emerald-400" } // odds 내려감 = 확률 ↑
      : { txt: "↑", color: "text-rose-600 dark:text-rose-400" };
  };
  const h = arrow(first.home, last.home);
  const a = arrow(first.away, last.away);
  return (
    <div className="flex items-center gap-2 text-[9px]">
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-0.5 bg-rose-500" />
        <span className="truncate max-w-[60px]">{homeNameKo}</span>
        <span className={`font-bold ${h.color}`}>{h.txt}</span>
      </span>
      {hasDraw && (
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 bg-neutral-400 border-dashed" />
          <span>무</span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className="inline-block w-2 h-0.5 bg-blue-500" />
        <span className="truncate max-w-[60px]">{awayNameKo}</span>
        <span className={`font-bold ${a.color}`}>{a.txt}</span>
      </span>
    </div>
  );
}
