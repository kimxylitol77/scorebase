// LoL/LCK 매치 라이브 상세 — 시리즈 점수 + 게임별 dot + 토너먼트 + 양팀 카드.
// in-game stats (킬·골드·드래곤 등) 는 BALLDONTLIE 미제공 → 표시 X, 안내문.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import CountUp from "./CountUp";

interface LolLive {
  matchId: number;
  status: "PRE" | "LIVE" | "FINAL";
  bestOf: 3 | 5;
  homeScore: number;
  awayScore: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  tournament: { id: number; name: string; tier?: string; status?: string };
  startDate: string;
  currentGame: number;
  needToWin: number;
}

interface Props {
  matchId: number;
  date: string;
  homeNameKo: string;
  awayNameKo: string;
  homeLogo?: string | null;
  awayLogo?: string | null;
  /** DB Team.id — 팀명/로고 클릭 시 /teams/{id} 이동 */
  homeTeamId?: number;
  awayTeamId?: number;
}

const POLL_LIVE_MS = 30_000;
const POLL_FINAL_MS = 120_000;

export default function LolLiveDetail({
  matchId,
  date,
  homeNameKo,
  awayNameKo,
  homeLogo,
  awayLogo,
  homeTeamId,
  awayTeamId,
}: Props) {
  const [live, setLive] = useState<LolLive | null>(null);
  const [loaded, setLoaded] = useState(false);
  const statusRef = useRef<LolLive["status"]>("PRE");
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
        const res = await fetch(`/api/live/lol/${matchId}?date=${date}`, {
          cache: "no-store",
          headers,
        });
        if (res.status === 304) return;
        if (!res.ok) return;
        const etag = res.headers.get("etag");
        if (etag) lastEtag = etag;
        const json: { live?: LolLive } = await res.json();
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
      const wait = statusRef.current === "LIVE" ? POLL_LIVE_MS : POLL_FINAL_MS;
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
  }, [matchId, date]);

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
  const isFinal = live.status === "FINAL";
  const slots = Array.from({ length: live.bestOf }, (_, i) => i + 1);

  // Scorebase LiveCard v2 — 우세팀 강조
  const awayWin = isFinal && live.awayScore > live.homeScore;
  const homeWin = isFinal && live.homeScore > live.awayScore;
  const liveLead = isLive && live.awayScore !== live.homeScore;
  const liveAwayLead = liveLead && live.awayScore > live.homeScore;
  const liveHomeLead = liveLead && live.homeScore > live.awayScore;

  return (
    <div className="space-y-4">
      {/* Scorebase LiveCard v2 — 통합 스코어보드 카드 */}
      <div
        className={`rounded-xl p-4 sm:p-5 space-y-3 match-card ${isLive ? "esports-live-card" : ""}`}
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* 헤더 */}
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
                {isFinal ? "종료" : `BO${live.bestOf} · 예정`}
              </span>
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              LCK
            </span>
            {isLive && (
              <span
                className="text-[11px] font-bold tabular-nums"
                style={{ color: "#22c55e" }}
              >
                {live.currentGame}게임
              </span>
            )}
          </div>
          {isLive && (
            <span className="text-[10px] text-neutral-500">30초 자동 갱신</span>
          )}
        </div>

        {/* 양팀 + 점수 */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-6 items-center">
          <TeamCol logo={awayLogo} name={awayNameKo} teamId={awayTeamId} />
          <div className="text-center font-black tabular-nums text-3xl sm:text-5xl tracking-tight">
            <span
              style={{
                color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  awayWin || liveAwayLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
              }}
            >
              <CountUp value={live.awayScore} />
            </span>
            <span className="mx-1.5 sm:mx-3 text-neutral-500 font-thin">:</span>
            <span
              style={{
                color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                textShadow:
                  homeWin || liveHomeLead ? "0 0 14px rgba(34,197,94,.45)" : "none",
              }}
            >
              <CountUp value={live.homeScore} />
            </span>
          </div>
          <TeamCol logo={homeLogo} name={homeNameKo} teamId={homeTeamId} />
        </div>
      </div>

      {/* 시리즈 진행 dot */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
        <div className="flex items-center justify-between text-xs text-neutral-500 mb-3">
          <span className="font-semibold">
            BO{live.bestOf} 시리즈 · {live.needToWin}승 필요
          </span>
          {isLive && (
            <span className="text-rose-600 dark:text-rose-400 font-semibold">
              {live.currentGame}게임 진행 중
            </span>
          )}
        </div>
        <SeriesRow
          name={awayNameKo}
          score={live.awayScore}
          slots={slots}
          current={isLive ? live.currentGame : null}
        />
        <div className="h-2" />
        <SeriesRow
          name={homeNameKo}
          score={live.homeScore}
          slots={slots}
          current={isLive ? live.currentGame : null}
        />
      </div>

      {/* 토너먼트 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-4 sm:p-5">
        <div className="text-[10px] uppercase font-bold tracking-wider text-neutral-400 mb-1">
          토너먼트
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold">{live.tournament.name}</span>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            {live.tournament.tier && (
              <span className="uppercase font-bold">{live.tournament.tier} tier</span>
            )}
            {live.tournament.status && (
              <span className="opacity-70">· {live.tournament.status}</span>
            )}
          </div>
        </div>
      </div>

      {/* in-game stats 미제공 안내 */}
      <div className="rounded-xl border border-dashed border-neutral-200 dark:border-neutral-800 p-3 sm:p-4 text-xs text-neutral-500">
        ⓘ LCK 게임 내 상세 정보 (킬·골드·드래곤·바론·챔피언 픽/밴) 는 외부 데이터 소스
        한계로 표시되지 않습니다. 시리즈 점수와 게임별 결과만 자동 갱신됩니다.
      </div>
    </div>
  );
}

function TeamCol({
  logo,
  name,
  teamId,
}: {
  logo?: string | null;
  name: string;
  teamId?: number;
}) {
  const inner = (
    <>
      {logo ? (
        // Liquipedia 가 scorebase.kr referer 를 hotlink 차단 → Next.js image proxy
        // 경유로 referer 우회. /scores 와 동일 패턴.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/_next/image?url=${encodeURIComponent(logo)}&w=128&q=75`}
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

function SeriesRow({
  name,
  score,
  slots,
  current,
}: {
  name: string;
  score: number;
  slots: number[];
  current: number | null;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="font-medium text-neutral-700 dark:text-neutral-300 w-24 sm:w-28 truncate">
        {name}
      </span>
      <div className="flex gap-1.5 flex-1">
        {slots.map((n) => {
          const won = n <= score;
          const isNow = n === current;
          return (
            <span
              key={n}
              className={`inline-block w-3.5 h-3.5 rounded-full ${
                won
                  ? "bg-cyan-500"
                  : isNow
                    ? "bg-cyan-300 dark:bg-cyan-400/60 animate-pulse"
                    : "bg-neutral-200 dark:bg-neutral-800"
              }`}
            />
          );
        })}
      </div>
      <span className="font-black tabular-nums w-5 text-right">{score}</span>
    </div>
  );
}
