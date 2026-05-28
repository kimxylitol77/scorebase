// /scores e스포츠 (LCK/LOL) 매치 카드 — Scorebase LiveCard v2.
// LIVE: 큰 BO 시리즈 박스 + 게임별 점 표시.
// 종료: 시리즈 결과만.
// 예정: 매치업 + KST 시간만.

import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { EsportsContext } from "../EsportsMiniBoard";
import FavoriteStar from "../FavoriteStar";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";

export interface EsportsCardProps {
  matchId?: string | number;
  status: "live" | "finished" | "scheduled" | "postponed";
  league: string;
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  timeLabel: string;
  liveStatusLabel?: string | null;
  esportsCtx?: EsportsContext | null;
  href?: string | null;
  actions?: ReactNode;
}

function Logo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // Liquipedia (LCK 로고) 는 hotlink Referer 검사로 외부 직접 fetch 불가 →
    // Next.js image optimizer 통해 서버가 fetch 후 재제공해야 표시됨.
    if (url.includes("liquipedia.net")) {
      return (
        <Image
          src={url}
          alt=""
          width={44}
          height={44}
          className="w-10 h-10 sm:w-11 sm:h-11 object-contain"
        />
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-10 h-10 sm:w-11 sm:h-11 object-contain"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/5 inline-flex items-center justify-center text-sm font-bold text-neutral-400">
      {name.slice(0, 1)}
    </div>
  );
}

export default function EsportsCard(props: EsportsCardProps) {
  const {
    matchId,
    status,
    league,
    leagueLabel,
    home,
    away,
    timeLabel,
    liveStatusLabel,
    esportsCtx,
    href,
    actions,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isScheduled = status === "scheduled";
  const isPostponed = status === "postponed";

  // 시리즈 점수 — LOL 은 series.away/home 이 게임 승 횟수 (= 점수와 동일)
  const seriesAway = esportsCtx?.series?.away ?? away.score ?? 0;
  const seriesHome = esportsCtx?.series?.home ?? home.score ?? 0;
  const hasScore = home.score != null && away.score != null;

  const homeWin = isFinished && seriesHome > seriesAway;
  const awayWin = isFinished && seriesAway > seriesHome;
  const liveLead = isLive && seriesHome !== seriesAway;
  const liveAwayLead = liveLead && seriesAway > seriesHome;
  const liveHomeLead = liveLead && seriesHome > seriesAway;

  const bestOf = esportsCtx?.bestOf ?? 3;
  const need = Math.ceil(bestOf / 2);
  const currentGame = esportsCtx?.currentGame ?? null;
  const gameSlots = Array.from({ length: bestOf }, (_, i) => i + 1);

  const statusBadge = isLive ? (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
      style={{ background: "rgba(239,68,68,.18)", color: "#fca5a5" }}
    >
      <span
        className="live-dot inline-block w-1.5 h-1.5 rounded-full"
        style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,.8)" }}
      />
      LIVE
    </span>
  ) : isFinished ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
      style={{ background: "rgba(255,255,255,.06)", color: "#94a3b8" }}
    >
      종료
    </span>
  ) : isPostponed ? (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
      style={{ background: "rgba(255,255,255,.06)", color: "#94a3b8" }}
    >
      연기
    </span>
  ) : (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider tabular-nums"
      style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}
    >
      {timeLabel}
    </span>
  );

  const body = (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {getLeagueFlag(league) && (
              <span className="mr-1 normal-case" aria-hidden>{getLeagueFlag(league)}</span>
            )}
            {leagueLabel ?? league}
          </span>
          {isLive && currentGame && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {currentGame}게임
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isScheduled && (
            <span className="text-[10px] text-neutral-500 tabular-nums">{timeLabel}</span>
          )}
          {matchId != null && <FavoriteStar matchId={String(matchId)} className="-mr-1" />}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="truncate text-xs sm:text-sm font-bold">{away.name}</div>
        </div>
        <div className="text-center font-black tabular-nums tracking-tight text-2xl sm:text-3xl">
          {!isScheduled && (hasScore || (esportsCtx?.series && (seriesHome > 0 || seriesAway > 0))) ? (
            <>
              <span
                style={{
                  color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    awayWin || liveAwayLead ? "0 0 12px rgba(34,197,94,.45)" : "none",
                }}
              >
                {seriesAway}
              </span>
              <span className="mx-1.5 text-neutral-500 font-thin">:</span>
              <span
                style={{
                  color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    homeWin || liveHomeLead ? "0 0 12px rgba(34,197,94,.45)" : "none",
                }}
              >
                {seriesHome}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-neutral-500">VS</span>
          )}
        </div>
        <div className="min-w-0 flex items-center gap-2 justify-end text-right">
          <div className="truncate text-xs sm:text-sm font-bold">{home.name}</div>
          <Logo url={home.logo} name={home.name} />
        </div>
      </div>

      {/* LIVE 또는 종료(시리즈 진행 결과) — 시리즈 박스 */}
      {(isLive || isFinished) && esportsCtx && (
        <div
          className="rounded-lg px-3 py-2.5 space-y-1.5"
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-neutral-300">
              BO{bestOf}
              {isLive && currentGame && (
                <span className="text-neutral-500"> · {currentGame}게임 진행</span>
              )}
            </span>
            <span className="text-[10px] text-neutral-500">{need}승 필요</span>
          </div>
          <SeriesRow
            label={away.abbr ?? short(away.name)}
            score={seriesAway}
            slots={gameSlots}
            currentGame={isLive ? currentGame : null}
            win={awayWin || liveAwayLead}
          />
          <SeriesRow
            label={home.abbr ?? short(home.name)}
            score={seriesHome}
            slots={gameSlots}
            currentGame={isLive ? currentGame : null}
            win={homeWin || liveHomeLead}
          />
        </div>
      )}

      {isScheduled && (
        <div className="text-center text-[11px] text-neutral-400 tabular-nums">
          KST {timeLabel}
        </div>
      )}

      {/* statusLabel 이 LIVE 외 정보를 담고 있으면 표시 */}
      {isLive && liveStatusLabel && !currentGame && (
        <div className="text-center text-[11px] text-neutral-400">
          {liveStatusLabel}
        </div>
      )}
    </div>
  );

  const isExternal = href != null && /^https?:\/\//i.test(href);
  return (
    <li
      className={`match-card list-none ${
        isLive ? "esports-live-card" : ""
      } ${isFinished ? "match-card-finished" : ""}`}
    >
      {href ? (
        isExternal ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="card-link">
            {body}
          </a>
        ) : (
          <Link href={href} prefetch={false} className="card-link">
            {body}
          </Link>
        )
      ) : (
        body
      )}
      {actions && (
        <div className="flex items-center justify-end gap-1.5 px-3 sm:px-4 pb-3 sm:pb-4">
          {actions}
        </div>
      )}
    </li>
  );
}

function short(name: string): string {
  if (/[가-힣]/.test(name)) return name.split(/\s+/)[0].slice(0, 4);
  return name.slice(0, 4);
}

function SeriesRow({
  label,
  score,
  slots,
  currentGame,
  win,
}: {
  label: string;
  score: number;
  slots: number[];
  currentGame: number | null;
  win: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-bold text-neutral-300 w-10 truncate">{label}</span>
      <div className="flex gap-1 flex-1">
        {slots.map((n) => {
          const won = n <= score;
          const isNow = n === currentGame;
          return (
            <span
              key={n}
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                background: won
                  ? "#06b6d4"
                  : isNow
                    ? "rgba(6,182,212,.4)"
                    : "rgba(255,255,255,.1)",
                boxShadow: won ? "0 0 6px rgba(6,182,212,.7)" : "none",
                border: !won && !isNow ? "1px solid rgba(255,255,255,.15)" : "none",
              }}
            />
          );
        })}
      </div>
      <span
        className="font-black tabular-nums w-4 text-right"
        style={{
          color: win ? "#22c55e" : "#cbd5e1",
          textShadow: win ? "0 0 6px rgba(34,197,94,.4)" : "none",
        }}
      >
        {score}
      </span>
    </div>
  );
}
