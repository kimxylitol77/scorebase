// /scores 야구 매치 카드 — Scorebase LiveCard v2.
// LIVE: 다이아몬드 + 아웃 + 이닝 박스 (R/H/E) 전체.
// 종료: 컨텍스트 박스 숨김, 이닝 박스만.
// 예정: 둘 다 숨김, 매치업 + KST 시간.

import Link from "next/link";
import type { ReactNode } from "react";
import type { BaseballLinescoreData } from "../BaseballLinescore";
import type { BaseballContext } from "../BaseballMiniBoard";
import FavoriteStar from "../FavoriteStar";
import BaseDiamond from "./BaseDiamond";
import OutCount from "./OutCount";
import LiveCommentaryBox, {
  type LiveCommentaryData,
} from "../../live/LiveCommentaryBox";

export interface BaseballLiveCardProps {
  matchId?: string | number;
  status: "live" | "finished" | "scheduled" | "postponed";
  league: string;
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null };
  timeLabel: string;
  liveStatusLabel?: string | null;
  baseballLinescore?: BaseballLinescoreData | null;
  baseballCtx?: BaseballContext | null;
  homeStarter?: string | null;
  awayStarter?: string | null;
  href?: string | null;
  actions?: ReactNode;
  /** Ollama (Mac mini) 생성 라이브 코멘터리 — LIVE 매치에만 표시 */
  liveCommentary?: LiveCommentaryData | null;
}

function Logo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
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

// statusLabel ("5회 초" / "5회 말") → { inning, half }
function parseInningFromLabel(
  label?: string | null,
): { inning: number | null; half: "top" | "bottom" | null } {
  if (!label) return { inning: null, half: null };
  const m = label.match(/(\d+)\s*회\s*(초|말)?/);
  if (!m) return { inning: null, half: null };
  const inning = parseInt(m[1], 10);
  const half = m[2] === "초" ? "top" : m[2] === "말" ? "bottom" : null;
  return { inning, half };
}

export default function BaseballLiveCard(props: BaseballLiveCardProps) {
  const {
    matchId,
    status,
    league,
    leagueLabel,
    home,
    away,
    timeLabel,
    liveStatusLabel,
    baseballLinescore,
    baseballCtx,
    homeStarter,
    awayStarter,
    href,
    actions,
    liveCommentary,
  } = props;

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isScheduled = status === "scheduled";
  const isPostponed = status === "postponed";

  // 회/말 — ctx 우선, 없으면 statusLabel 파싱
  const parsed = parseInningFromLabel(liveStatusLabel);
  const inning = baseballCtx?.inning ?? parsed.inning;
  const half = baseballCtx?.half ?? parsed.half;
  const halfKo = half === "top" ? "초" : half === "bottom" ? "말" : "";
  const inningText = inning ? `${inning}회 ${halfKo}`.trim() : null;

  const bases = baseballCtx?.bases ?? null;
  const outs = (baseballCtx?.outs ?? null) as 0 | 1 | 2 | 3 | null;

  const hasScore = home.score != null && away.score != null;
  const homeScore = home.score ?? 0;
  const awayScore = away.score ?? 0;
  const homeWin = isFinished && homeScore > awayScore;
  const awayWin = isFinished && awayScore > homeScore;

  // 진행 중인 팀 강조 — LIVE 일 때만 (안 끝났으니 win/lose 확정 X)
  const liveLead = isLive && homeScore !== awayScore;
  const liveAwayLead = liveLead && awayScore > homeScore;
  const liveHomeLead = liveLead && homeScore > awayScore;

  const ls = baseballLinescore;
  const totalInnings = Math.max(
    9,
    ls?.awayInnings.length ?? 0,
    ls?.homeInnings.length ?? 0,
  );
  const inningIdx = Array.from({ length: totalInnings }, (_, i) => i);

  // 상태 배지
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
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {leagueLabel ?? league}
          </span>
          {isLive && inningText && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {inningText}
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

      {/* 팀 + 점수 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="min-w-0">
            <div className="truncate text-xs sm:text-sm font-bold">{away.name}</div>
            {awayStarter && (
              <div className="truncate text-[10px] text-neutral-500">투수 {awayStarter}</div>
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
                    awayWin || liveAwayLead
                      ? "0 0 12px rgba(34,197,94,.45)"
                      : "none",
                }}
              >
                {awayScore}
              </span>
              <span className="mx-1.5 text-neutral-500 font-thin">:</span>
              <span
                style={{
                  color: homeWin || liveHomeLead ? "#22c55e" : "#cbd5e1",
                  textShadow:
                    homeWin || liveHomeLead
                      ? "0 0 12px rgba(34,197,94,.45)"
                      : "none",
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
          <div className="min-w-0">
            <div className="truncate text-xs sm:text-sm font-bold">
              <span className="inline-block rounded bg-zinc-700 text-xs text-zinc-200 px-1.5 py-0.5 mr-1">홈</span>
              {home.name}
            </div>
            {homeStarter && (
              <div className="truncate text-[10px] text-neutral-500">투수 {homeStarter}</div>
            )}
          </div>
          <Logo url={home.logo} name={home.name} />
        </div>
      </div>

      {/* 상황 박스 (LIVE 만) — 다이아몬드 + 주자/아웃 + 우측 빈 공간엔 AI 코멘터리 */}
      {isLive && (
        <div
          className="rounded-lg px-3 py-2.5 flex items-center gap-3"
          style={{
            background: "rgba(255,255,255,.02)",
            border: "1px solid rgba(255,255,255,.06)",
          }}
        >
          <BaseDiamond bases={bases} size={64} />
          <div className="shrink-0">
            <div className="text-[11px] text-neutral-500 mb-1">
              {bases ? basesText(bases) : "주자 정보 없음"}
            </div>
            <div className="flex items-center gap-2">
              <OutCount outs={outs} />
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {outs != null ? `${outs}아웃` : "아웃 -"}
              </span>
            </div>
          </div>
          {liveCommentary && (
            <LiveCommentaryBox {...liveCommentary} variant="card" />
          )}
        </div>
      )}

      {/* 이닝 박스 (LIVE/종료) — 모바일: 스크롤바 숨김 + min-w 제거 */}
      {ls && (isLive || isFinished) && (
        <div
          className="overflow-x-auto -mx-1 px-1 [&::-webkit-scrollbar]:hidden"
          style={{ scrollbarWidth: "none" }}
        >
          <table className="text-[11px] sm:text-xs w-full sm:min-w-[360px]">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-semibold py-1 pr-1.5 sm:pr-2 w-9 sm:w-10">팀</th>
                {inningIdx.map((i) => {
                  const isCurrent = isLive && inning != null && i + 1 === inning;
                  return (
                    <th
                      key={i}
                      className="text-center font-semibold py-1 px-0 tabular-nums"
                      style={{
                        color: isCurrent ? "#22c55e" : "#475569",
                        fontWeight: isCurrent ? 600 : 500,
                      }}
                    >
                      {i + 1}
                    </th>
                  );
                })}
                <th className="text-center font-bold py-1 pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 tabular-nums text-neutral-200">
                  R
                </th>
                <th className="text-center font-semibold py-1 px-0.5 sm:px-1 tabular-nums">H</th>
                <th className="text-center font-semibold py-1 pl-0.5 sm:pl-1 tabular-nums">E</th>
              </tr>
            </thead>
            <tbody>
              <BoxRow
                label={ls.awayLabel}
                line={ls.awayInnings}
                innings={totalInnings}
                currentInning={isLive ? inning : null}
                r={ls.awayScore}
                h={ls.awayHits}
                e={ls.awayErrors}
                win={awayWin || liveAwayLead}
              />
              <BoxRow
                label={ls.homeLabel}
                line={ls.homeInnings}
                innings={totalInnings}
                currentInning={isLive ? inning : null}
                r={ls.homeScore}
                h={ls.homeHits}
                e={ls.homeErrors}
                win={homeWin || liveHomeLead}
              />
            </tbody>
          </table>
        </div>
      )}

      {/* 예정 — KST 시간 */}
      {isScheduled && (
        <div className="text-center text-[11px] text-neutral-400 tabular-nums">
          KST {timeLabel}
        </div>
      )}

      {actions && (
        <div className="flex items-center justify-end gap-1.5">{actions}</div>
      )}
    </div>
  );

  const isExternal = href != null && /^https?:\/\//i.test(href);
  return (
    <li
      className={`match-card list-none ${
        isLive ? "baseball-live-card" : ""
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
    </li>
  );
}

function BoxRow({
  label,
  line,
  innings,
  currentInning,
  r,
  h,
  e,
  win,
}: {
  label: string;
  line: (number | null)[];
  innings: number;
  currentInning: number | null;
  r: number;
  h: number | null;
  e: number | null;
  win: boolean;
}) {
  return (
    <tr>
      <td className="py-1 pr-1.5 sm:pr-2 font-bold text-neutral-300 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: innings }, (_, i) => {
        const v = line[i];
        const isCurrent = currentInning != null && i + 1 === currentInning;
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
        className="text-center font-black py-1 pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 tabular-nums"
        style={{
          color: win ? "#22c55e" : "#cbd5e1",
          textShadow: win ? "0 0 8px rgba(34,197,94,.45)" : "none",
        }}
      >
        {r}
      </td>
      <td className="text-center py-1 px-0.5 sm:px-1 tabular-nums text-neutral-400">
        {h ?? "-"}
      </td>
      <td className="text-center py-1 pl-0.5 sm:pl-1 tabular-nums text-neutral-400">
        {e ?? "-"}
      </td>
    </tr>
  );
}

function basesText(b: [boolean, boolean, boolean]): string {
  const on: string[] = [];
  if (b[0]) on.push("1루");
  if (b[1]) on.push("2루");
  if (b[2]) on.push("3루");
  if (on.length === 0) return "주자 없음";
  return on.join("·");
}
