// MLB 라이브 상세 — ESPN summary 정규화 endpoint를 polling.
// 이닝별 linescore + 베이스 다이아몬드 + B/S/O 카운트 + 현재 투수/타자 + 마지막 플레이.
// 라이브 상태일 때 10초 polling, 종료/예정이면 stop.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";

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

interface MlbLive {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string;
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  awayTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
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

  return (
    <div className="space-y-4">
      {/* 상단 스코어 보드 */}
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
            {isLive ? `LIVE · ${live.statusLabel}` : live.statusLabel || "—"}
          </span>
          {isLive && (
            <span className="text-[10px] text-rose-600/70 dark:text-rose-400/70">
              10초 자동 갱신
            </span>
          )}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          {/* 원정팀 */}
          <TeamBlock
            teamId={awayTeamId}
            logo={live.awayTeam.logo}
            fallbackLogo={awayLogoUrl}
            abbr={live.awayTeam.abbreviation}
            name={awayLabel}
          />
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <CountUp
              value={live.awayTeam.score}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
            <span className="mx-1.5 sm:mx-3 text-neutral-300 dark:text-neutral-700">
              :
            </span>
            <CountUp
              value={live.homeTeam.score}
              className={isLive ? "text-rose-600 dark:text-rose-400" : ""}
            />
          </div>
          {/* 홈팀 */}
          <TeamBlock
            teamId={homeTeamId}
            logo={live.homeTeam.logo}
            fallbackLogo={homeLogoUrl}
            abbr={live.homeTeam.abbreviation}
            name={homeLabel}
          />
        </div>
      </div>

      {/* 라이브 일 때만: 베이스 + 카운트 + 투수/타자 */}
      {isLive && live.situation && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 sm:gap-6 items-center">
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
            <div className="space-y-2 text-sm">
              {live.situation.pitcherName && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    투수
                  </span>
                  <div className="font-semibold">{live.situation.pitcherName}</div>
                </div>
              )}
              {live.situation.batterName && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    타자
                  </span>
                  <div className="font-semibold">{live.situation.batterName}</div>
                </div>
              )}
              {live.situation.lastPlay && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
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

      {/* 이닝별 linescore */}
      {live.linescore && live.linescore.home.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-x-auto">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2 text-left font-bold text-neutral-500">
                  팀
                </th>
                {live.linescore.away.map((_, i) => (
                  <th
                    key={i}
                    className="px-2 py-2 text-center font-bold text-neutral-500 tabular-nums"
                  >
                    {i + 1}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-black text-neutral-900 dark:text-white">
                  R
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              <tr>
                <td className="px-3 py-2 font-semibold">
                  {live.awayTeam.abbreviation}
                </td>
                {live.linescore.away.map((v, i) => (
                  <td
                    key={i}
                    className="px-2 py-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300"
                  >
                    {v ?? "-"}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-black tabular-nums">
                  {live.awayTeam.score}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-semibold">
                  {live.homeTeam.abbreviation}
                </td>
                {live.linescore.home.map((v, i) => (
                  <td
                    key={i}
                    className="px-2 py-2 text-center tabular-nums text-neutral-700 dark:text-neutral-300"
                  >
                    {v ?? "-"}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-black tabular-nums">
                  {live.homeTeam.score}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
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
  const active = "fill-rose-500 stroke-rose-600";
  const inactive = "fill-neutral-200 stroke-neutral-400 dark:fill-neutral-800 dark:stroke-neutral-600";
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
