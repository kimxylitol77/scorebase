// KBO / NPB 야구 통합 탭 카드 (4탭: 타자/투수/배당/승률).
// "팀 스탯" 은 MatchInsight 의 teamStatsContent 탭으로 흡수됨 (BaseballTeamStatsCard).
// 데이터 source: TheSports detailLive (players + stats) + linescore + baseballOdds.
//
// MLB 와 달리:
//  - PBP (중계) 없음 — TheSports 미제공
//  - 라인업 (batting order) 없음 — TheSports detailLive.players 순서가 batting order 아님
//  - 팀 통계 (ESPN) 없음 — KBO/NPB 는 ESPN cover 안 함
//  - 선수 사진 없음 (KBO) — 별도 source 없음
//
// SSR 데이터만 사용 (polling 없음). 새로고침으로 갱신.

"use client";

import { useState } from "react";
import Link from "next/link";
import BaseballWpaChart from "./BaseballWpaChart";
import LiveOddsCard from "./LiveOddsCard";
import { baseballPositionLabel } from "@/lib/sports/thesports/baseball-stats";

interface PlayerStatRow {
  playerId: string;
  role: "batter" | "pitcher";
  stats: Record<number, number>;
}

interface PlayerStatLabel {
  statId: number;
  label: string;
  decimal: boolean;
}

interface WpaPoint {
  inning: number;
  homeWP: number;
  homeScore: number;
  awayScore: number;
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
  bookmakerList?: Array<{
    key: string;
    title: string;
    h2h: { home: number; draw: number | null; away: number } | null;
  }>;
  fetchedAt: number;
}

interface Props {
  homeNameKo: string;
  awayNameKo: string;
  /** TheSports detail_live.players 의 home/away 배열 추출된 PlayerStatRow. */
  playerStats: { home: PlayerStatRow[]; away: PlayerStatRow[] };
  /** role 별 stat 컬럼 정의 (사전 계산). */
  batterColumns: PlayerStatLabel[];
  pitcherColumns: PlayerStatLabel[];
  /** ts player_id → 한글/영문 이름 매핑. miss 시 id slice. */
  playerNameById: Record<string, string>;
  /** ts player_id → 사진 URL. miss 시 이니셜 fallback. */
  playerPhotoById?: Record<string, string>;
  /** ts player_id → 선수 상세 링크. 로스터 이름 매칭 성공분만(모호하면 없음 = 텍스트 유지). */
  playerHrefById?: Record<string, string>;
  /** 라이브 배당 + 시계열 (SSR) */
  initialOdds?: {
    odds: LiveOdds;
    history: Array<{ fetchedAt: number; home: number | null; away: number | null }>;
  } | null;
  /** linescore — 이닝별 점수 (1-9+). [away, home] 순서. WPA 계산용. */
  wpaSeries?: WpaPoint[] | null;
  /** 매치 상태 — 배당 freshness("경기 전 최종") 표기용. */
  matchStatus?: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED";
}

type TabKey = "batting" | "pitching" | "odds" | "wpa";

function fmt(v: number | undefined, decimal: boolean): string {
  if (v == null) return "-";
  if (decimal) return v.toFixed(2);
  return v.toString();
}

export default function BaseballBoxscoreTabs({
  homeNameKo,
  awayNameKo,
  playerStats,
  batterColumns,
  pitcherColumns,
  playerNameById,
  playerPhotoById,
  playerHrefById,
  initialOdds,
  wpaSeries,
  matchStatus,
}: Props) {
  const [tab, setTab] = useState<TabKey>("batting");
  const [side, setSide] = useState<"away" | "home">("away");

  const hasBatters = !!(
    playerStats.home.some((p) => p.role === "batter") ||
    playerStats.away.some((p) => p.role === "batter")
  );
  const hasPitchers = !!(
    playerStats.home.some((p) => p.role === "pitcher") ||
    playerStats.away.some((p) => p.role === "pitcher")
  );
  const hasOdds = !!initialOdds?.odds;
  const hasWpa = !!(wpaSeries && wpaSeries.length >= 2);

  // 시작 전 매치는 라이브 데이터 없음. 카드 자체는 띄우고 각 탭에 안내.
  // 단 배당이 없으면 모든 탭 비어있는 상태 — 그 경우만 hide.
  const tabs: { key: TabKey; label: string; enabled: boolean; withTeamToggle: boolean }[] = [
    { key: "batting", label: "타자 기록", enabled: true, withTeamToggle: true },
    { key: "pitching", label: "투수 기록", enabled: true, withTeamToggle: true },
    { key: "odds", label: "라이브 배당", enabled: hasOdds, withTeamToggle: false },
    { key: "wpa", label: "승률 곡선", enabled: true, withTeamToggle: false },
  ];

  const visibleTabs = tabs.filter((t) => t.enabled);
  if (visibleTabs.length === 0) return null;
  // default 탭: 데이터 있는 첫 탭 (없으면 첫 visible)
  const dataAvailable: Record<TabKey, boolean> = {
    batting: hasBatters,
    pitching: hasPitchers,
    odds: hasOdds,
    wpa: hasWpa,
  };
  const desiredTab = dataAvailable[tab] ? tab : visibleTabs.find((t) => dataAvailable[t.key])?.key ?? visibleTabs[0].key;
  const activeTab = desiredTab;
  const currentTabInfo = tabs.find((t) => t.key === activeTab)!;

  const sideRows = side === "home" ? playerStats.home : playerStats.away;
  // DB 미등록 선수 — TheSports 가 선수 등록 전이거나(신규 콜업, 익일 cron 해소)
  // 영구 미식별 placeholder id (예: KBO vmwz). cryptic "#vmwz" 대신 라벨 표시.
  const koName = (pid: string) => playerNameById[pid] ?? "미확인 선수";
  const koPhoto = (pid: string) => playerPhotoById?.[pid];
  const koHref = (pid: string) => playerHrefById?.[pid];

  return (
    <section className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
      {/* 탭 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 sm:px-4 pt-3 pb-3 border-b border-neutral-100 dark:border-neutral-900">
        <div className="flex items-center gap-1 text-sm overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden whitespace-nowrap">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition shrink-0 ${
                activeTab === t.key
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {currentTabInfo.withTeamToggle ? (
          <div className="inline-flex items-center rounded-lg bg-neutral-100 dark:bg-neutral-900 p-0.5 text-xs shrink-0">
            {(["away", "home"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`px-2.5 py-1 rounded-md transition ${
                  side === s
                    ? "bg-white dark:bg-neutral-800 font-semibold text-neutral-900 dark:text-white shadow-sm"
                    : "text-neutral-500"
                }`}
              >
                {s === "away" ? awayNameKo : homeNameKo}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="p-3 sm:p-4">
        {activeTab === "batting" ? (
          <StatTable
            rows={sideRows.filter((r) => r.role === "batter")}
            columns={batterColumns}
            koName={koName}
            koPhoto={koPhoto}
            koHref={koHref}
            roleLabel="타자"
          />
        ) : activeTab === "pitching" ? (
          <StatTable
            rows={sideRows.filter((r) => r.role === "pitcher")}
            columns={pitcherColumns}
            koName={koName}
            koPhoto={koPhoto}
            koHref={koHref}
            roleLabel="투수"
          />
        ) : activeTab === "odds" && initialOdds?.odds ? (
          <div className="[&>section]:border-0 [&>section]:p-0 [&>section]:rounded-none [&>section]:bg-transparent">
            <LiveOddsCard
              odds={initialOdds.odds}
              homeNameKo={homeNameKo}
              awayNameKo={awayNameKo}
              hasDraw={false}
              matchStatus={matchStatus}
              oddsHistory={initialOdds.history
                .filter(
                  (p): p is { fetchedAt: number; home: number; away: number } =>
                    p.home != null && p.away != null,
                )
                .map((p) => ({
                  fetchedAt: p.fetchedAt,
                  home: p.home,
                  draw: null,
                  away: p.away,
                }))}
            />
          </div>
        ) : activeTab === "wpa" ? (
          wpaSeries && wpaSeries.length >= 2 ? (
            <BaseballWpaChart
              series={wpaSeries}
              homeNameKo={homeNameKo}
              awayNameKo={awayNameKo}
            />
          ) : (
            <p className="text-center text-xs text-neutral-500 py-6">
              매치 시작 후 이닝별 승률 곡선이 표시됩니다.
            </p>
          )
        ) : null}
      </div>
    </section>
  );
}

function StatTable({
  rows,
  columns,
  koName,
  koPhoto,
  koHref,
  roleLabel,
}: {
  rows: PlayerStatRow[];
  columns: PlayerStatLabel[];
  koName: (pid: string) => string;
  koPhoto: (pid: string) => string | undefined;
  koHref: (pid: string) => string | undefined;
  roleLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        {roleLabel} 기록 아직 없음.
      </p>
    );
  }
  if (columns.length === 0) {
    return (
      <p className="text-center text-xs text-neutral-500 py-6">
        {roleLabel} stat 매핑 미완성.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
            <th className="text-left py-1.5 pr-2 font-medium">{roleLabel}</th>
            {columns.map((c) => (
              <th
                key={c.statId}
                className="text-right px-1.5 py-1.5 font-medium tabular-nums"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const photo = koPhoto(p.playerId);
            const name = koName(p.playerId);
            const pos = roleLabel === "타자" ? baseballPositionLabel(p.stats[613]) : "";
            return (
            <tr
              key={p.playerId}
              className="border-b border-neutral-100 dark:border-neutral-900"
            >
              <td className="py-1.5 pr-2">
                <div className="flex items-center gap-2 max-w-[160px]">
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={name}
                      width={28}
                      height={28}
                      loading="lazy"
                      className="w-7 h-7 rounded-full object-cover bg-neutral-100 dark:bg-neutral-900 shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-neutral-100 dark:bg-neutral-900 shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-neutral-400">
                      {name.charAt(0)}
                    </span>
                  )}
                  {koHref(p.playerId) ? (
                    <Link href={koHref(p.playerId)!} className="font-medium truncate hover:underline">
                      {name}
                    </Link>
                  ) : (
                    <span className="font-medium truncate">{name}</span>
                  )}
                  {pos && (
                    <span className="text-[10px] font-normal text-neutral-400 shrink-0">
                      {pos}
                    </span>
                  )}
                </div>
              </td>
              {columns.map((c) => (
                <td
                  key={c.statId}
                  className="text-right tabular-nums px-1.5 py-1.5"
                >
                  {fmt(p.stats[c.statId], c.decimal)}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
