// MLB 라이브 상세 — ESPN summary 정규화 endpoint를 polling.
// 이닝별 linescore + 베이스 다이아몬드 + B/S/O 카운트 + 현재 투수/타자 + 마지막 플레이.
// 라이브 상태일 때 10초 polling, 종료/예정이면 stop.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import LiveOddsCard from "./live/LiveOddsCard";
import BaseballWpaChart from "./live/BaseballWpaChart";

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-12 h-12 sm:w-14 sm:h-14 object-contain mx-auto mb-1"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-1 rounded-full bg-white/5 inline-flex items-center justify-center text-base font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

function TeamBlock({
  teamId,
  logo,
  fallbackLogo,
  abbr,
  name,
}: {
  teamId?: number;
  logo?: string | null;
  fallbackLogo?: string | null;
  abbr: string;
  name: string;
}) {
  const inner = (
    <>
      <TeamLogo url={logo ?? fallbackLogo} name={name} />
      <div className="text-xs sm:text-sm font-semibold text-neutral-500">
        {abbr}
      </div>
      <div className="font-bold truncate">{name}</div>
    </>
  );
  if (teamId != null) {
    return (
      <Link
        href={`/teams/${teamId}`}
        className="text-center block hover:opacity-80 transition"
      >
        {inner}
      </Link>
    );
  }
  return <div className="text-center">{inner}</div>;
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
  fetchedAt: number;
}

interface WpaPoint {
  inning: number;
  homeWP: number;
  homeScore: number;
  awayScore: number;
}

interface MlbLive {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string;
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  awayTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  liveOdds?: LiveOdds | null;
  wpaSeries?: WpaPoint[] | null;
  situation: {
    balls: number | null;
    strikes: number | null;
    outs: number | null;
    onFirst: boolean;
    onSecond: boolean;
    onThird: boolean;
    batterName: string | null;
    pitcherName: string | null;
    lastPlay: string | null;
  } | null;
}

interface Props {
  gameId: string;
  /** 한글 팀명 매핑 (toKoreanTeamName 결과를 SSR 단에서 미리 받아옴) */
  homeNameKo?: string;
  awayNameKo?: string;
  /** DB Team.id — 팀명/로고 클릭 시 /teams/{id} 이동 */
  homeTeamId?: number;
  awayTeamId?: number;
  /** DB Team.logoUrl — ESPN 응답에 logo 누락 시 fallback */
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
}

const POLL_LIVE_MS = 10_000;
const POLL_FINAL_MS = 60_000;

export default function MlbLiveDetail({
  gameId,
  homeNameKo,
  awayNameKo,
  homeTeamId,
  awayTeamId,
  homeLogoUrl,
  awayLogoUrl,
}: Props) {
  const [live, setLive] = useState<MlbLive | null>(null);
  const [loaded, setLoaded] = useState(false);

  const statusRef = useRef<MlbLive["status"]>("PRE");
  if (live) statusRef.current = live.status;

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastEtag: string | null = null;

    const fetchOnce = async () => {
      try {
        const headers: HeadersInit = lastEtag
          ? { "if-none-match": lastEtag }
          : {};
        const res = await fetch(`/api/live/mlb/${gameId}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: MlbLive; error?: string } = await res.json();
        if (!alive) return;
        if (json.live) {
          setLive(json.live);
          setLoaded(true);
        }
      } catch {
        // ignore
      }
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (typeof document !== "undefined" && document.hidden) return;
      const wait =
        statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_FINAL_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };

    fetchOnce().then(schedule);
    const onVisibility = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [gameId]);

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500 animate-pulse">
        라이브 정보를 불러오는 중…
      </div>
    );
  }
  if (!live) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-10 text-center text-sm text-neutral-500">
        라이브 정보를 가져오지 못했습니다.
      </div>
    );
  }

  const awayLabel = awayNameKo ?? live.awayTeam.name;
  const homeLabel = homeNameKo ?? live.homeTeam.name;
  const isLive = live.status === "LIVE";

  // Scorebase LiveCard v2 — 우세팀 강조 색상 계산
  const awayScore = live.awayTeam.score;
  const homeScore = live.homeTeam.score;
  const isFinished = live.status === "FINAL";
  const awayWin = isFinished && awayScore > homeScore;
  const homeWin = isFinished && homeScore > awayScore;
  const liveLead = isLive && awayScore !== homeScore;
  const liveAwayLead = liveLead && awayScore > homeScore;
  const liveHomeLead = liveLead && homeScore > awayScore;

  // statusLabel ("5회 초"/"5회 말") → inning + half 파싱
  const inningMatch = live.statusLabel.match(/(\d+)\s*회\s*(초|말)?/);
  const currentInning = inningMatch ? parseInt(inningMatch[1], 10) : null;
  const halfKo = inningMatch?.[2] ?? null;
  const inningText = currentInning ? `${currentInning}회 ${halfKo ?? ""}`.trim() : null;

  const innings = live.linescore
    ? Math.max(9, live.linescore.away.length, live.linescore.home.length)
    : 9;

  return (
    <div className="space-y-4">
      {/* Scorebase LiveCard v2 — 통합 스코어보드 카드 */}
      <div
        className={`rounded-xl p-4 sm:p-5 space-y-3 ${
          isLive ? "match-card baseball-live-card" : "match-card"
        }`}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* 헤더 — LIVE 배지 + 회/말 + 자동 갱신 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isLive ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
                style={{ background: "rgba(239,68,68,.18)", color: "#fca5a5" }}
              >
                <span
                  className="live-dot inline-block w-1.5 h-1.5 rounded-full"
                  style={{
                    background: "#ef4444",
                    boxShadow: "0 0 6px rgba(239,68,68,.8)",
                  }}
                />
                LIVE
              </span>
            ) : (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
                style={{ background: "rgba(255,255,255,.06)", color: "#94a3b8" }}
              >
                {isFinished ? "종료" : live.statusLabel || "—"}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              MLB
            </span>
            {isLive && inningText && (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: "#22c55e" }}
              >
                {inningText}
              </span>
            )}
          </div>
          {isLive && (
            <span className="text-[10px] text-neutral-500">10초 자동 갱신</span>
          )}
        </div>

        {/* 양팀 + 점수 */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <TeamBlock
            teamId={awayTeamId}
            logo={live.awayTeam.logo}
            fallbackLogo={awayLogoUrl}
            abbr={live.awayTeam.abbreviation}
            name={awayLabel}
          />
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <span
              style={{
                color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  awayWin || liveAwayLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
              }}
            >
              <CountUp value={awayScore} />
            </span>
            <span className="mx-1.5 sm:mx-3 text-neutral-500 font-thin">:</span>
            <span
              style={{
                color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  homeWin || liveHomeLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
              }}
            >
              <CountUp value={homeScore} />
            </span>
          </div>
          <TeamBlock
            teamId={homeTeamId}
            logo={live.homeTeam.logo}
            fallbackLogo={homeLogoUrl}
            abbr={live.homeTeam.abbreviation}
            name={homeLabel}
          />
        </div>

        {/* 상황 박스 (LIVE 만) — 다이아몬드 + B/S/O + 투수/타자 */}
        {isLive && live.situation && (
          <div
            className="rounded-lg px-3 py-2.5 sm:px-4 sm:py-3"
            style={{
              background: "rgba(255,255,255,.02)",
              border: "1px solid rgba(255,255,255,.06)",
            }}
          >
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:gap-5 items-center">
              <div className="flex items-center gap-4 justify-center">
                <BaseDiamond
                  onFirst={live.situation.onFirst}
                  onSecond={live.situation.onSecond}
                  onThird={live.situation.onThird}
                />
                <CountIndicator
                  balls={live.situation.balls ?? 0}
                  strikes={live.situation.strikes ?? 0}
                  outs={live.situation.outs ?? 0}
                />
              </div>
              <div className="space-y-1.5 text-sm">
                {live.situation.pitcherName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                      투수
                    </span>
                    <div className="font-semibold">
                      {live.situation.pitcherName}
                    </div>
                  </div>
                )}
                {live.situation.batterName && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                      타자
                    </span>
                    <div className="font-semibold">
                      {live.situation.batterName}
                    </div>
                  </div>
                )}
                {live.situation.lastPlay && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                      마지막 플레이
                    </span>
                    <div className="text-neutral-700 dark:text-neutral-300 text-xs leading-relaxed">
                      {live.situation.lastPlay}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 이닝 박스 (LIVE/종료) */}
        {live.linescore && live.linescore.home.length > 0 && (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="text-[11px] sm:text-xs w-full min-w-[360px]">
              <thead>
                <tr className="text-neutral-500">
                  <th className="text-left font-semibold py-1 pr-2 w-10">팀</th>
                  {Array.from({ length: innings }, (_, i) => {
                    const isCur =
                      isLive && currentInning != null && i + 1 === currentInning;
                    return (
                      <th
                        key={i}
                        className="text-center font-semibold py-1 px-0 tabular-nums"
                        style={{
                          color: isCur ? "#22c55e" : "#475569",
                          fontWeight: isCur ? 600 : 500,
                        }}
                      >
                        {i + 1}
                      </th>
                    );
                  })}
                  <th className="text-center font-bold py-1 pl-2 pr-1 tabular-nums text-neutral-200">
                    R
                  </th>
                </tr>
              </thead>
              <tbody>
                <BoxRow
                  label={live.awayTeam.abbreviation}
                  line={live.linescore.away}
                  innings={innings}
                  currentInning={isLive ? currentInning : null}
                  total={awayScore}
                  win={awayWin || liveAwayLead}
                />
                <BoxRow
                  label={live.homeTeam.abbreviation}
                  line={live.linescore.home}
                  innings={innings}
                  currentInning={isLive ? currentInning : null}
                  total={homeScore}
                  win={homeWin || liveHomeLead}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 라이브 승률 곡선 (WPA — Poisson 모델) */}
      {live.wpaSeries && live.wpaSeries.length > 1 && (
        <BaseballWpaChart
          series={live.wpaSeries}
          homeNameKo={homeNameKo ?? live.homeTeam.name}
          awayNameKo={awayNameKo ?? live.awayTeam.name}
        />
      )}

      {/* 라이브 배당 (The Odds API 1분 갱신) */}
      {live.liveOdds && (
        <LiveOddsCard
          odds={live.liveOdds}
          homeNameKo={homeNameKo ?? live.homeTeam.name}
          awayNameKo={awayNameKo ?? live.awayTeam.name}
          hasDraw={false}
        />
      )}
    </div>
  );
}

function BoxRow({
  label,
  line,
  innings,
  currentInning,
  total,
  win,
}: {
  label: string;
  line: (number | null)[];
  innings: number;
  currentInning: number | null;
  total: number;
  win: boolean;
}) {
  return (
    <tr>
      <td className="py-1 pr-2 font-bold text-neutral-300 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: innings }, (_, i) => {
        const v = line[i];
        const isCur = currentInning != null && i + 1 === currentInning;
        return (
          <td
            key={i}
            className="text-center tabular-nums py-1 px-0"
            style={{
              background: isCur ? "rgba(34,197,94,.1)" : "transparent",
              borderRadius: isCur ? 4 : 0,
              color: v == null ? "#334155" : "#cbd5e1",
            }}
          >
            {v ?? "·"}
          </td>
        );
      })}
      <td
        className="text-center font-black py-1 pl-2 pr-1 tabular-nums"
        style={{
          color: win ? "#22c55e" : "#cbd5e1",
          textShadow: win ? "0 0 8px rgba(34,197,94,.45)" : "none",
        }}
      >
        {total}
      </td>
    </tr>
  );
}

/** 베이스 다이아몬드 — 1·2·3루 점유 여부 시각화. */
function BaseDiamond({
  onFirst,
  onSecond,
  onThird,
}: {
  onFirst: boolean;
  onSecond: boolean;
  onThird: boolean;
}) {
  // Scorebase LiveCard v2 — cyan glow 베이스
  const active = "fill-cyan-500 stroke-cyan-300";
  const inactive = "fill-white/5 stroke-white/20";
  return (
    <svg
      viewBox="0 0 80 80"
      width="64"
      height="64"
      aria-label="베이스 상황"
      className="shrink-0"
    >
      {/* 2루 (top) */}
      <rect
        x="33"
        y="13"
        width="14"
        height="14"
        transform="rotate(45 40 20)"
        className={onSecond ? active : inactive}
        strokeWidth="1.5"
      />
      {/* 3루 (left) */}
      <rect
        x="13"
        y="33"
        width="14"
        height="14"
        transform="rotate(45 20 40)"
        className={onThird ? active : inactive}
        strokeWidth="1.5"
      />
      {/* 1루 (right) */}
      <rect
        x="53"
        y="33"
        width="14"
        height="14"
        transform="rotate(45 60 40)"
        className={onFirst ? active : inactive}
        strokeWidth="1.5"
      />
      {/* 홈 (bottom) — 항상 회색 */}
      <rect
        x="33"
        y="53"
        width="14"
        height="14"
        transform="rotate(45 40 60)"
        className="fill-neutral-100 stroke-neutral-300 dark:fill-neutral-900 dark:stroke-neutral-700"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/** B / S / O 카운트 dot 표시. */
function CountIndicator({
  balls,
  strikes,
  outs,
}: {
  balls: number;
  strikes: number;
  outs: number;
}) {
  const dot = (filled: boolean, color: string) => (
    <span
      className={`inline-block w-2 h-2 rounded-full ${
        filled ? color : "bg-neutral-200 dark:bg-neutral-700"
      }`}
    />
  );
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[10px] items-center">
      <span className="font-bold text-neutral-500">B</span>
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i}>{dot(i < balls, "bg-emerald-500")}</span>
        ))}
      </div>
      <span className="font-bold text-neutral-500">S</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i}>{dot(i < strikes, "bg-amber-500")}</span>
        ))}
      </div>
      <span className="font-bold text-neutral-500">O</span>
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i}>{dot(i < outs, "bg-rose-500")}</span>
        ))}
      </div>
    </div>
  );
}
