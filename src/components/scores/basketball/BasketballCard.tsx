// /scores 농구 (NBA) 매치 카드 — Scorebase LiveCard v2.
// LIVE: 큰 쿼터/클럭 컨텍스트 박스 + 쿼터별 점수 표 (1Q-4Q + T).
// 종료: 쿼터별 점수 표만.
// 예정: 매치업 + KST 시간만.

import Link from "next/link";
import type { ReactNode } from "react";
import type { PeriodLinescore as PeriodData } from "@/lib/sports/live-scores";
import FavoriteStar from "../FavoriteStar";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";

export interface BasketballCardProps {
  matchId?: string | number;
  status: "live" | "finished" | "scheduled" | "postponed";
  league: string;
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  timeLabel: string;
  /** "3Q 8:42" / "1Q" / "LIVE" 등 */
  liveStatusLabel?: string | null;
  periodLinescore?: PeriodData | null;
  href?: string | null;
  actions?: ReactNode;
}

function Logo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-10 h-10 sm:w-11 sm:h-11 object-contain bg-white rounded-md p-0.5"
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

/** "3Q 8:42" → { quarter: 3, clock: "8:42" }, "3Q" → { quarter: 3, clock: null } */
function parseQuarter(label?: string | null): { quarter: number | null; clock: string | null } {
  if (!label) return { quarter: null, clock: null };
  const m = label.match(/(\d+)Q(?:\s+(.+))?/);
  if (!m) return { quarter: null, clock: null };
  return { quarter: parseInt(m[1], 10), clock: m[2]?.trim() ?? null };
}

export default function BasketballCard(props: BasketballCardProps) {
  const {
    matchId,
    status,
    league,
    leagueLabel,
    home,
    away,
    timeLabel,
    liveStatusLabel,
    periodLinescore,
    href,
    actions,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isScheduled = status === "scheduled";
  const isPostponed = status === "postponed";

  const { quarter, clock } = parseQuarter(liveStatusLabel);
  const quarterText = quarter ? `${quarter}쿼터` : null;

  const hasScore = home.score != null && away.score != null;
  const homeScore = home.score ?? 0;
  const awayScore = away.score ?? 0;
  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;
  const liveLead = isLive && homeScore !== awayScore;
  const liveAwayLead = liveLead && awayScore > homeScore;
  const liveHomeLead = liveLead && homeScore > awayScore;

  const data = periodLinescore;
  const total = data
    ? Math.max(4, data.awayPeriods.length, data.homePeriods.length)
    : 4;
  const periodIdx = Array.from({ length: total }, (_, i) => i);

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

  const labelFor = (i: number) => {
    if (i + 1 <= 4) return `Q${i + 1}`;
    if (i + 1 === 5) return "OT";
    return `${i - 3}OT`;
  };

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
          {isLive && quarterText && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {quarterText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isScheduled && (
            <span className="text-[10px] text-neutral-500 tabular-nums">{timeLabel}</span>
          )}
          <button
            type="button"
            title="이 종목 배당이 어디로 움직이는지 — 배당 흐름 보기"
            onClick={(e) => {
              // 카드 전체가 <Link> 라 nested anchor 회피 — window.open 우회.
              e.preventDefault();
              e.stopPropagation();
              if (typeof window !== "undefined")
                window.open("/odds?sport=basketball", "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center px-1.5 h-5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/25 transition whitespace-nowrap cursor-pointer"
          >
            배당흐름
          </button>
          {matchId != null && <FavoriteStar matchId={String(matchId)} className="-mr-1" />}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold">
            {away.name}
            {away.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                [{away.position}]
              </span>
            )}
          </div>
        </div>
        <div className="text-center font-black tabular-nums tracking-tight text-2xl sm:text-3xl">
          {hasScore ? (
            <>
              <span
                style={{
                  color: awayWin || liveAwayLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    awayWin || liveAwayLead ? "0 0 12px rgba(34,197,94,.45)" : "none",
                }}
              >
                {awayScore}
              </span>
              <span className="mx-1.5 text-neutral-500 font-thin">:</span>
              <span
                style={{
                  color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    homeWin || liveHomeLead ? "0 0 12px rgba(34,197,94,.45)" : "none",
                }}
              >
                {homeScore}
              </span>
            </>
          ) : (
            <span className="text-base font-bold text-neutral-500">VS</span>
          )}
        </div>
        <div className="min-w-0 flex items-center gap-2 justify-end text-right">
          <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold">
            {home.name}
            {home.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                [{home.position}]
              </span>
            )}
          </div>
          <Logo url={home.logo} name={home.name} />
        </div>
      </div>

      {/* 컨텍스트 — LIVE 만. 클럭 있으면 쿼터+클럭, 없으면 라벨(하프타임/연장 등) */}
      {isLive && (
        <div
          className="rounded-lg px-3 py-3 text-center"
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          {clock ? (
            <>
              <div className="text-[11px] text-neutral-500 mb-0.5">
                {quarterText ?? "진행 중"}
              </div>
              <div
                className="text-2xl font-black tabular-nums"
                style={{ color: "#22c55e" }}
              >
                {clock}
              </div>
            </>
          ) : (
            <div className="text-xl font-black" style={{ color: "#22c55e" }}>
              {quarterText ?? liveStatusLabel ?? "진행 중"}
            </div>
          )}
        </div>
      )}

      {/* 쿼터별 점수 (LIVE/종료) */}
      {data && (isLive || isFinished) && (
        <div className="-mx-1 px-1">
          <table className="text-[11px] sm:text-xs w-full table-fixed">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-semibold py-1 pr-1 w-9">팀</th>
                {periodIdx.map((i) => {
                  const isCurrent = isLive && quarter != null && i + 1 === quarter;
                  return (
                    <th
                      key={i}
                      className="text-center font-semibold py-1 px-0 tabular-nums"
                      style={{
                        color: isCurrent ? "#22c55e" : "#475569",
                        fontWeight: isCurrent ? 600 : 500,
                      }}
                    >
                      {labelFor(i)}
                    </th>
                  );
                })}
                <th className="text-center font-bold py-1 pl-2 pr-1 tabular-nums text-neutral-200">
                  T
                </th>
              </tr>
            </thead>
            <tbody>
              <Row
                label={away.abbr ?? short(away.name)}
                line={data.awayPeriods}
                total={data.awayScore}
                periods={total}
                currentPeriod={isLive ? quarter : null}
                win={awayWin || liveAwayLead}
              />
              <Row
                label={home.abbr ?? short(home.name)}
                line={data.homePeriods}
                total={data.homeScore}
                periods={total}
                currentPeriod={isLive ? quarter : null}
                win={homeWin || liveHomeLead}
              />
            </tbody>
          </table>
        </div>
      )}

      {isScheduled && (
        <div className="text-center text-[11px] text-neutral-400 tabular-nums">
          KST {timeLabel}
        </div>
      )}
    </div>
  );

  const isExternal = href != null && /^https?:\/\//i.test(href);
  return (
    <li
      className={`match-card list-none ${
        isLive ? "basketball-live-card" : ""
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

function Row({
  label,
  line,
  total,
  periods,
  currentPeriod,
  win,
}: {
  label: string;
  line: (number | null)[];
  total: number;
  periods: number;
  currentPeriod: number | null;
  win: boolean;
}) {
  return (
    <tr>
      <td className="py-1 pr-2 font-bold text-neutral-300 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: periods }, (_, i) => {
        const v = line[i];
        const isCurrent = currentPeriod != null && i + 1 === currentPeriod;
        return (
          <td
            key={i}
            className="text-center tabular-nums py-1 px-0"
            style={{
              background: isCurrent ? "rgba(34,197,94,.1)" : "transparent",
              borderRadius: isCurrent ? 4 : 0,
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
