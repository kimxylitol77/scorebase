// KBO/NPB 라이브 상세 — api-sports Baseball 정규화 endpoint를 polling.
// 안 A: 이닝별 linescore + H/E/R + 점수 + 양팀 선발 (SSR 단에서 prop 전달).
// 베이스/볼카운트/투수·타자는 api-sports 미제공 → "공식 라이브로 가기" 외부 링크 노출.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import LiveOddsCard from "./live/LiveOddsCard";

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

interface BaseballLive {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string;
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  awayTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  league: { id: number; name: string };
  liveOdds?: LiveOdds | null;
}

interface Props {
  gameId: string;
  /** "KBO" | "NPB" — 외부 라이브 링크 분기 */
  league: "KBO" | "NPB";
  /** 한글 팀명 (SSR 단에서 toKoreanTeamName 결과) */
  homeNameKo: string;
  awayNameKo: string;
  /** 양팀 선발투수 (DB Match.{home,away}Starter, 이미 JSON parse 된 이름) */
  homeStarter?: string | null;
  awayStarter?: string | null;
  /** 약자 (LG, 두산 등) — DB Team.shortName */
  homeAbbr?: string | null;
  awayAbbr?: string | null;
  /** 팀 로고 URL (DB Team.logoUrl) */
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** DB Team.id — 팀명/로고 클릭 시 /teams/{id} 이동 */
  homeTeamId?: number;
  awayTeamId?: number;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-12 h-12 sm:w-16 sm:h-16 object-contain mx-auto mb-1"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-1 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

const POLL_LIVE_MS = 15_000;
const POLL_FINAL_MS = 60_000;

function TeamWrap({
  teamId,
  children,
}: {
  teamId?: number;
  children: React.ReactNode;
}) {
  if (teamId != null) {
    return (
      <Link
        href={`/teams/${teamId}`}
        className="text-center block hover:opacity-80 transition"
      >
        {children}
      </Link>
    );
  }
  return <div className="text-center">{children}</div>;
}

export default function BaseballLiveDetail({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  homeStarter,
  awayStarter,
  homeAbbr,
  awayAbbr,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
}: Props) {
  const [live, setLive] = useState<BaseballLive | null>(null);
  const [loaded, setLoaded] = useState(false);

  const statusRef = useRef<BaseballLive["status"]>("PRE");
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
        const res = await fetch(`/api/live/baseball/${gameId}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: BaseballLive; error?: string } = await res.json();
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

  const isLive = live.status === "LIVE";
  // 약자 라인은 shortName 이 있고 풀명과 다를 때만. 같으면 풀명만 표시 (중복 제거)
  const homeShort = homeAbbr && homeAbbr !== homeNameKo ? homeAbbr : null;
  const awayShort = awayAbbr && awayAbbr !== awayNameKo ? awayAbbr : null;
  // linescore 테이블 헤더용 — 약자 우선, 없으면 풀명
  const homeLabel = homeShort ?? homeNameKo;
  const awayLabel = awayShort ?? awayNameKo;

  // 이닝 칸 = max(home, away, 9). null 끝부분은 잘라서 진행 이닝까지만.
  const lsAway = live.linescore?.away ?? [];
  const lsHome = live.linescore?.home ?? [];
  const innings = Math.max(9, lsAway.length, lsHome.length);

  const officialUrl =
    league === "KBO"
      ? "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx"
      : "https://baseball.yahoo.co.jp/npb/";
  const officialLabel = league === "KBO" ? "KBO 공식" : "Yahoo Sports JP";

  // Scorebase LiveCard v2 — 우세팀 강조 색상
  const awayScore = live.awayTeam.score;
  const homeScore = live.homeTeam.score;
  const isFinished = !isLive && live.status === "FINAL";
  const awayWin = isFinished && awayScore > homeScore;
  const homeWin = isFinished && homeScore > awayScore;
  const liveLead = isLive && awayScore !== homeScore;
  const liveAwayLead = liveLead && awayScore > homeScore;
  const liveHomeLead = liveLead && homeScore > awayScore;

  const inningMatch = live.statusLabel.match(/(\d+)\s*회\s*(초|말)?/);
  const currentInning = inningMatch ? parseInt(inningMatch[1], 10) : null;
  const halfKo = inningMatch?.[2] ?? null;
  const inningText = currentInning ? `${currentInning}회 ${halfKo ?? ""}`.trim() : null;

  return (
    <div className="space-y-4">
      {/* Scorebase LiveCard v2 — 통합 스코어보드 카드 */}
      <div
        className={`rounded-xl p-4 sm:p-5 space-y-3 ${
          isLive ? "match-card baseball-live-card" : "match-card"
        }`}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* 헤더 — LIVE/종료 배지 + 회/말 */}
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
              {league}
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
            <span className="text-[10px] text-neutral-500">15초 자동 갱신</span>
          )}
        </div>

        {/* 양팀 + 점수 */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <TeamWrap teamId={awayTeamId}>
            <TeamLogo url={awayLogo} name={awayNameKo} />
            {awayShort && (
              <div className="text-xs sm:text-sm font-semibold text-neutral-500">
                {awayShort}
              </div>
            )}
            <div className="font-bold truncate">{awayNameKo}</div>
            {awayStarter && (
              <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                선발 {awayStarter}
              </div>
            )}
          </TeamWrap>
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <span
              style={{
                color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  awayWin || liveAwayLead
                    ? "0 0 14px rgba(34,197,94,.45)"
                    : "none",
              }}
            >
              <CountUp value={awayScore} />
            </span>
            <span className="mx-1.5 sm:mx-3 text-neutral-500 font-thin">:</span>
            <span
              style={{
                color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  homeWin || liveHomeLead
                    ? "0 0 14px rgba(34,197,94,.45)"
                    : "none",
              }}
            >
              <CountUp value={homeScore} />
            </span>
          </div>
          <TeamWrap teamId={homeTeamId}>
            <TeamLogo url={homeLogo} name={homeNameKo} />
            {homeShort && (
              <div className="text-xs sm:text-sm font-semibold text-neutral-500">
                {homeShort}
              </div>
            )}
            <div className="font-bold truncate">{homeNameKo}</div>
            {homeStarter && (
              <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
                선발 {homeStarter}
              </div>
            )}
          </TeamWrap>
        </div>

        {/* 이닝 박스 + R/H/E */}
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
                <th className="text-center font-semibold py-1 px-1 tabular-nums">
                  H
                </th>
                <th className="text-center font-semibold py-1 pl-1 tabular-nums">
                  E
                </th>
              </tr>
            </thead>
            <tbody>
              <ScoreRow
                label={awayLabel}
                line={lsAway}
                innings={innings}
                currentInning={isLive ? currentInning : null}
                total={awayScore}
                hits={live.awayTeam.hits}
                errors={live.awayTeam.errors}
                win={awayWin || liveAwayLead}
              />
              <ScoreRow
                label={homeLabel}
                line={lsHome}
                innings={innings}
                currentInning={isLive ? currentInning : null}
                total={homeScore}
                hits={live.homeTeam.hits}
                errors={live.homeTeam.errors}
                win={homeWin || liveHomeLead}
              />
            </tbody>
          </table>
        </div>
      </div>

      {/* 라이브 배당 (The Odds API 1분 갱신) */}
      {live.liveOdds && (
        <LiveOddsCard
          odds={live.liveOdds}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
          hasDraw={false}
        />
      )}

      {/* 베이스/볼카운트 미제공 안내 + 공식 링크 */}
      {isLive && (
        <div
          className="rounded-xl p-3 sm:p-4 text-xs flex flex-wrap items-center justify-between gap-2"
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
            color: "#94a3b8",
          }}
        >
          <span>
            ⓘ {league} 는 베이스 상황·볼카운트·현재 투수/타자가 제공되지 않습니다.
            상세 라이브는 공식 페이지에서 확인 가능합니다.
          </span>
          <a
            href={officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md font-semibold whitespace-nowrap transition"
            style={{
              background: "rgba(34,197,94,.1)",
              border: "1px solid rgba(34,197,94,.3)",
              color: "#86efac",
            }}
          >
            {officialLabel} →
          </a>
        </div>
      )}
    </div>
  );
}

function ScoreRow({
  label,
  line,
  innings,
  currentInning,
  total,
  hits,
  errors,
  win,
}: {
  label: string;
  line: (number | null)[];
  innings: number;
  currentInning: number | null;
  total: number;
  hits: number | null;
  errors: number | null;
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
      <td className="text-center py-1 px-1 tabular-nums text-neutral-400">
        {hits ?? "-"}
      </td>
      <td className="text-center py-1 pl-1 tabular-nums text-neutral-400">
        {errors ?? "-"}
      </td>
    </tr>
  );
}
