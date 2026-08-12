// /scores 배구 (VNL/AVC/유럽리그) 매치 카드 — HockeyCard 패턴.
// LIVE: 진행 세트 + 현재 세트 점수 + 세트별 점수표. 종료: 세트별 점수표. 예정: 매치업 + KST.
// 점수(큰 숫자) = 세트 스코어 (ft). 세트별 표의 T = 세트 합계.

import Link from "next/link";
import type { ReactNode } from "react";
import type { PeriodLinescore as PeriodData } from "@/lib/sports/live-scores";
import FavoriteStar from "../FavoriteStar";
import TeamNameCell from "../TeamNameCell";
import { getLeagueFlag } from "@/lib/sports/sport-leagues";

export interface VolleyballCardProps {
  matchId?: string | number;
  status: "live" | "finished" | "scheduled" | "postponed";
  league: string;
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  timeLabel: string;
  /** "2세트 18-15" / "3세트" 등 (page.tsx volleyballLiveLabel) */
  liveStatusLabel?: string | null;
  /** homePeriods/awayPeriods = 세트별 점수, homeScore/awayScore = 세트 스코어 */
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

function parseSet(label?: string | null): { set: number | null; points: string | null } {
  if (!label) return { set: null, points: null };
  const m = label.match(/(\d)세트(?:\s+(.+))?/);
  if (!m) return { set: null, points: null };
  return { set: parseInt(m[1], 10), points: m[2]?.trim() ?? null };
}

export default function VolleyballCard(props: VolleyballCardProps) {
  const {
    matchId, status, league, leagueLabel, home, away,
    timeLabel, liveStatusLabel, periodLinescore, href, actions,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isScheduled = status === "scheduled";
  const isPostponed = status === "postponed";

  const { set, points } = parseSet(liveStatusLabel);
  const setText = set ? `${set}세트` : null;

  // 시작 전 경기는 점수를 안 그린다 — 일부 소스가 예정 경기를 0-0 으로 실어 보낸다.
  const hasScore = (isLive || isFinished) && home.score != null && away.score != null;
  const homeScore = home.score ?? 0;
  const awayScore = away.score ?? 0;
  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;
  const liveLead = isLive && homeScore !== awayScore;
  const liveAwayLead = liveLead && awayScore > homeScore;
  const liveHomeLead = liveLead && homeScore > awayScore;

  const data = periodLinescore;
  const total = data
    ? Math.max(3, data.awayPeriods.length, data.homePeriods.length)
    : 3;
  const setIdx = Array.from({ length: total }, (_, i) => i);

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
          {isLive && setText && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {setText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isScheduled && (
            <span className="text-[10px] text-neutral-500 tabular-nums">{timeLabel}</span>
          )}
          {matchId != null && (
            <FavoriteStar
              matchId={String(matchId)}
              meta={{
                id: String(matchId),
                sport: "volleyball",
                league,
                homeName: home.name,
                awayName: away.name,
                homeShort: home.abbr ?? undefined,
                awayShort: away.abbr ?? undefined,
                homeScore: home.score,
                awayScore: away.score,
                status,
                statusLabel: liveStatusLabel ?? timeLabel,
                href: href ?? undefined,
              }}
              className="-mr-1"
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <TeamNameCell className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold">
            <span data-teamname>{away.name}</span>
            {away.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 tabular-nums">[{away.position}]</span>
            )}
          </div>
        </TeamNameCell>
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
        <TeamNameCell className="min-w-0 flex items-center gap-2 justify-end text-right">
          <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold">
            <span data-teamname>{home.name}</span>
            {home.position != null && (
              <span className="ml-1 text-[10px] font-semibold text-neutral-500 tabular-nums">[{home.position}]</span>
            )}
          </div>
          <Logo url={home.logo} name={home.name} />
        </TeamNameCell>
      </div>

      {/* 진행 상태 — 세트/현재 점수 있을 때만 */}
      {isLive && (setText || points) && (
        <div
          className="rounded-lg px-3 py-2 text-center"
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          <div className="text-sm font-black tabular-nums" style={{ color: "#22c55e" }}>
            {setText ?? "진행 중"}
            {points ? ` · ${points}` : ""}
          </div>
        </div>
      )}

      {data && (isLive || isFinished) && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="text-[11px] sm:text-xs w-full min-w-[280px]">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-semibold py-1 pr-2 w-10">팀</th>
                {setIdx.map((i) => {
                  const isCurrent = isLive && set != null && i + 1 === set;
                  return (
                    <th
                      key={i}
                      className="text-center font-semibold py-1 px-0 tabular-nums"
                      style={{
                        color: isCurrent ? "#22c55e" : "#475569",
                        fontWeight: isCurrent ? 600 : 500,
                      }}
                    >
                      {i + 1}세트
                    </th>
                  );
                })}
                <th className="text-center font-bold py-1 pl-2 pr-1 tabular-nums text-neutral-200">
                  세트
                </th>
              </tr>
            </thead>
            <tbody>
              <Row
                label={away.abbr ?? short(away.name)}
                line={data.awayPeriods}
                total={data.awayScore}
                periods={total}
                currentSet={isLive ? set : null}
                win={awayWin || liveAwayLead}
              />
              <Row
                label={home.abbr ?? short(home.name)}
                line={data.homePeriods}
                total={data.homeScore}
                periods={total}
                currentSet={isLive ? set : null}
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
        isLive ? "hockey-live-card" : ""
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
  currentSet,
  win,
}: {
  label: string;
  line: (number | null)[];
  total: number;
  periods: number;
  currentSet: number | null;
  win: boolean;
}) {
  return (
    <tr>
      <td className="py-1 pr-2 font-bold text-neutral-300 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: periods }, (_, i) => {
        const v = line[i];
        const isCurrent = currentSet != null && i + 1 === currentSet;
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
