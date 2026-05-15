// NBA / NHL / 축구 라이브 상세 — /api/live/match/{gameId}?league=X polling.
// MLB/KBO/NPB/LOL 은 자체 컴포넌트 사용. 이 컴포넌트는 이외 종목용.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";
import SoccerGoals from "./scores/SoccerGoals";

interface PeriodLinescore {
  homePeriods: (number | null)[];
  awayPeriods: (number | null)[];
  homeScore: number;
  awayScore: number;
}

interface SoccerGoal {
  minute: string;
  side: "home" | "away";
  player: string;
  ownGoal: boolean;
  penaltyKick: boolean;
}

interface MatchLive {
  status: "LIVE" | "FINAL" | "PRE" | "UNKNOWN";
  statusLabel: string;
  homeScore: number | null;
  awayScore: number | null;
  periodLinescore?: PeriodLinescore | null;
  soccerGoals?: SoccerGoal[] | null;
}

interface Props {
  gameId: string;
  league: string;
  /** 한글 팀명 */
  homeNameKo: string;
  awayNameKo: string;
  /** DB Team.id — 클릭 시 /teams/{id} 이동 */
  homeTeamId?: number;
  awayTeamId?: number;
  /** DB Team.logoUrl — fallback 로고 */
  homeLogoUrl?: string | null;
  awayLogoUrl?: string | null;
  /** SSR 단에서 본 초기 점수 (라이브 데이터 도착 전 placeholder) */
  initialHomeScore?: number | null;
  initialAwayScore?: number | null;
  /** DB Match.status — 라이브 API 가 매치 못 찾을 때 fallback (종료된 매치 등) */
  initialStatus?: "FINISHED" | "SCHEDULED" | "LIVE" | "POSTPONED";
}

const POLL_LIVE_MS = 20_000;
const POLL_IDLE_MS = 60_000;

export default function SportLiveDetail({
  gameId,
  league,
  homeNameKo,
  awayNameKo,
  homeTeamId,
  awayTeamId,
  homeLogoUrl,
  awayLogoUrl,
  initialHomeScore,
  initialAwayScore,
  initialStatus,
}: Props) {
  const [live, setLive] = useState<MatchLive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const statusRef = useRef<MatchLive["status"]>("UNKNOWN");
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
        const res = await fetch(
          `/api/live/match/${gameId}?league=${encodeURIComponent(league)}`,
          { cache: "no-store", headers },
        );
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: MatchLive } = await res.json();
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
        statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_IDLE_MS;
      timer = setTimeout(async () => {
        await fetchOnce();
        schedule();
      }, wait);
    };
    fetchOnce().then(schedule);
    const onVis = () => {
      if (document.hidden) {
        if (timer) clearTimeout(timer);
      } else {
        fetchOnce();
        schedule();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [gameId, league]);

  // SSR placeholder — 첫 fetch 도착 전엔 DB 점수/상태만 표시
  const isLive = live?.status === "LIVE";
  const isFinal =
    live?.status === "FINAL" ||
    // 라이브 API 에 매치 없고 DB 가 FINISHED 면 종료된 경기로 간주
    (loaded && live?.status !== "LIVE" && initialStatus === "FINISHED");
  const homeScore = live?.homeScore ?? initialHomeScore ?? null;
  const awayScore = live?.awayScore ?? initialAwayScore ?? null;
  const statusBadge = !loaded
    ? initialStatus === "FINISHED" ? "종료" : "LOADING"
    : isLive
      ? `LIVE${live?.statusLabel ? ` · ${live.statusLabel}` : ""}`
      : isFinal
        ? "종료"
        : initialStatus === "POSTPONED"
          ? "연기"
          : (live?.statusLabel || "예정");

  return (
    <div className="space-y-4">
      {/* 상단 점수 보드 */}
      <div className="rounded-2xl border border-rose-200 dark:border-rose-500/20 bg-gradient-to-br from-rose-50/50 to-white dark:from-rose-500/10 dark:to-neutral-950 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold ${
              isLive
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
            }`}
          >
            {isLive && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            )}
            {statusBadge}
          </span>
          {isLive && (
            <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70">
              20초 자동 갱신
            </span>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <TeamBlock teamId={awayTeamId} logo={awayLogoUrl} name={awayNameKo} />
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <CountUp
              value={awayScore ?? 0}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
            <span className="mx-1.5 sm:mx-3 text-neutral-300 dark:text-neutral-700">
              :
            </span>
            <CountUp
              value={homeScore ?? 0}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
          </div>
          <TeamBlock teamId={homeTeamId} logo={homeLogoUrl} name={homeNameKo} />
        </div>
      </div>

      {/* NBA/NHL — 쿼터/피리어드 linescore */}
      {live?.periodLinescore && (
        <PeriodTable
          league={league}
          linescore={live.periodLinescore}
          homeNameKo={homeNameKo}
          awayNameKo={awayNameKo}
        />
      )}

      {/* 축구 — 골 (라이브스코어 카드와 동일한 2-컬럼 away/home 레이아웃) */}
      {live?.soccerGoals && live.soccerGoals.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 py-2">
          <div className="px-3.5 sm:px-4 pt-2 pb-1 flex items-center justify-between text-[10px] font-bold tracking-wider uppercase text-neutral-400">
            <span className="truncate">{awayNameKo}</span>
            <span>⚽ 골</span>
            <span className="truncate text-right">{homeNameKo}</span>
          </div>
          <SoccerGoals goals={live.soccerGoals} />
        </div>
      )}

      {/* 데이터 없음 안내 */}
      {loaded && !live?.periodLinescore && (!live?.soccerGoals || live.soccerGoals.length === 0) && (
        <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-3 sm:p-4 text-xs text-neutral-500">
          ⓘ {league === "NBA" || league === "NHL"
            ? "쿼터/피리어드 별 점수 데이터를 가져오지 못했습니다."
            : "골 이벤트 데이터가 아직 없거나 외부 데이터 소스에서 미제공 상태입니다."}
        </div>
      )}
    </div>
  );
}

function TeamBlock({
  teamId,
  logo,
  name,
}: {
  teamId?: number;
  logo?: string | null;
  name: string;
}) {
  const inner = (
    <>
      {logo ? (
        // ESPN/NHL 은 hotlink OK. liquipedia (LCK 만) 만 _next/image proxy 필요.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt=""
          className="w-12 h-12 sm:w-16 sm:h-16 object-contain mx-auto mb-1.5"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-1.5 rounded-full bg-neutral-100 dark:bg-neutral-900 inline-flex items-center justify-center text-base font-bold text-neutral-400">
          {name.slice(0, 1)}
        </div>
      )}
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

function PeriodTable({
  league,
  linescore,
  homeNameKo,
  awayNameKo,
}: {
  league: string;
  linescore: PeriodLinescore;
  homeNameKo: string;
  awayNameKo: string;
}) {
  const periodLabel = league === "NHL" ? "P" : "Q";
  const cols = Math.max(linescore.homePeriods.length, linescore.awayPeriods.length);
  const ot = league === "NHL" ? 4 : 5; // NHL 4피리어드부터 OT, NBA 5쿼터부터 OT
  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-2">
        {league === "NHL" ? "피리어드 별 점수" : "쿼터 별 점수"}
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] text-neutral-500">
              <th className="text-left font-medium pb-1 sm:pb-2">팀</th>
              {Array.from({ length: cols }, (_, i) => i).map((i) => {
                const isOt = i + 1 >= ot;
                return (
                  <th key={i} className="text-center font-medium px-1.5 sm:px-2 pb-1 sm:pb-2">
                    {isOt ? `OT${i + 2 - ot}` : `${i + 1}${periodLabel}`}
                  </th>
                );
              })}
              <th className="text-right font-bold pl-2 pb-1 sm:pb-2">합계</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1.5 font-semibold truncate max-w-[120px]">{awayNameKo}</td>
              {Array.from({ length: cols }, (_, i) => (
                <td key={i} className="text-center px-1.5 sm:px-2">
                  {linescore.awayPeriods[i] ?? "—"}
                </td>
              ))}
              <td className="text-right pl-2 font-bold">{linescore.awayScore}</td>
            </tr>
            <tr className="border-t border-neutral-100 dark:border-neutral-800">
              <td className="py-1.5 font-semibold truncate max-w-[120px]">{homeNameKo}</td>
              {Array.from({ length: cols }, (_, i) => (
                <td key={i} className="text-center px-1.5 sm:px-2">
                  {linescore.homePeriods[i] ?? "—"}
                </td>
              ))}
              <td className="text-right pl-2 font-bold">{linescore.homeScore}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

