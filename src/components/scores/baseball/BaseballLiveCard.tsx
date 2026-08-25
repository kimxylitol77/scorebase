// /scores 야구 매치 카드 — Scorebase LiveCard v2.
// LIVE: 다이아몬드 + 아웃 + 이닝 박스 (R/H/E) 전체.
// 종료: 컨텍스트 박스 숨김, 이닝 박스만.
// 예정: 둘 다 숨김, 매치업 + KST 시간.

import Link from "next/link";
import type { ReactNode } from "react";
import { postponedLabel } from "@/lib/sports/sport-leagues";
import type { BaseballLinescoreData } from "../BaseballLinescore";
import type { BaseballContext } from "../BaseballMiniBoard";
import FavoriteStar from "../FavoriteStar";
import TeamNameCell from "../TeamNameCell";
import BaseDiamond from "./BaseDiamond";
import OutCount from "./OutCount";
import BaseballScore from "./BaseballScore";
import LiveCommentaryBox, {
  type LiveCommentaryData,
} from "../../live/LiveCommentaryBox";

export interface BaseballLiveCardProps {
  matchId?: string | number;
  status: "live" | "finished" | "scheduled" | "postponed";
  league: string;
  leagueLabel?: string;
  home: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
  away: { name: string; abbr?: string | null; logo?: string | null; score?: number | null; position?: number | null };
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
  /** 같은 두 팀이 같은 날 2경기 이상일 때 (MLB 더블헤더) — 1차전/2차전 배지 */
  doubleHeader?: { index: number; total: number } | null;
}

function Logo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // navy 로고(Twins/Yankees 등)가 다크모드 카드 배경에 묻혀 안 보이는 문제 →
    // 흰 배경 chip 으로 대비 확보 (ESPN/365scores 와 동일 패턴). MLB/NBA/NHL 로고는
    // 본래 밝은 배경용이라 흰 chip 이 안전. e스포츠/LCK(흰 로고)는 의도적으로 미적용.
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
    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-neutral-100 dark:bg-white/5 inline-flex items-center justify-center text-sm font-bold text-neutral-500 dark:text-neutral-400">
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
    doubleHeader,
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
  const inningText = baseballCtx?.isExtra ? "연장" : inning ? `${inning}회 ${halfKo}`.trim() : null;

  const bases = baseballCtx?.bases ?? null;
  const outs = (baseballCtx?.outs ?? null) as 0 | 1 | 2 | 3 | null;

  // 시작 전 경기는 점수를 안 그린다 — 일부 소스(ESPN)가 예정 경기를 0-0 으로 실어 보내
  // null 검사만 하면 킥오프 전에 "0 : 0" 이 뜬다(2026-07-29 MLB 실측). 축구 행과 같은 게이트.
  const hasScore = (isLive || isFinished) && home.score != null && away.score != null;
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-neutral-100 dark:bg-white/[.06] text-neutral-500 dark:text-slate-400">
      종료
    </span>
  ) : isPostponed ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider bg-neutral-100 dark:bg-white/[.06] text-neutral-500 dark:text-slate-400">
      {postponedLabel(league)}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider tabular-nums bg-sky-100 dark:bg-blue-500/[.12] text-sky-700 dark:text-blue-400">
      {timeLabel}
    </span>
  );

  const body = (
    <div className="p-3 sm:p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {leagueLabel ?? league}
          </span>
          {doubleHeader && (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400"
              title={`더블헤더 ${doubleHeader.index}차전 (총 ${doubleHeader.total}경기)`}
            >
              DH {doubleHeader.index}
            </span>
          )}
          {isLive && inningText && (
            <span className="text-[11px] font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              {inningText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!isScheduled && (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500 tabular-nums">
              {timeLabel}
            </span>
          )}
          <button
            type="button"
            title="이 종목 배당이 어디로 움직이는지 — 배당 흐름 보기"
            onClick={(e) => {
              // 카드 전체가 <Link> 라 nested anchor 회피 — window.open 우회.
              e.preventDefault();
              e.stopPropagation();
              if (typeof window !== "undefined")
                window.open("/odds?sport=baseball", "_blank", "noopener,noreferrer");
            }}
            className="inline-flex items-center px-1.5 h-5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/25 transition whitespace-nowrap cursor-pointer"
          >
            배당흐름
          </button>
          {matchId != null && (
            <FavoriteStar
              matchId={String(matchId)}
              meta={{
                id: String(matchId),
                sport: "baseball",
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

      {/* 팀 + 점수 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        <TeamNameCell className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="min-w-0">
            <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
              <span data-teamname>{away.name}</span>
              {away.position != null && (
                <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                  [{away.position}]
                </span>
              )}
            </div>
            {awayStarter && (
              <div className="truncate text-[10px] text-neutral-500 dark:text-neutral-500">
                투수 {awayStarter}
              </div>
            )}
          </div>
        </TeamNameCell>

        <div className="text-center font-black tabular-nums tracking-tight text-2xl sm:text-3xl">
          {hasScore ? (
            <BaseballScore
              awayScore={awayScore}
              homeScore={homeScore}
              awayHighlight={awayWin || liveAwayLead}
              homeHighlight={homeWin || liveHomeLead}
              isLive={isLive}
            />
          ) : (
            <span className="text-base font-bold text-neutral-400 dark:text-neutral-500">
              VS
            </span>
          )}
        </div>

        <TeamNameCell className="min-w-0 flex items-center gap-2 justify-end text-right">
          <div className="min-w-0">
            <div className="line-clamp-2 break-keep leading-tight text-xs sm:text-sm font-bold text-neutral-900 dark:text-neutral-100">
              <span className="inline-block rounded bg-neutral-200 text-neutral-700 dark:bg-zinc-700 dark:text-zinc-200 text-xs px-1.5 py-0.5 mr-1">
                홈
              </span>
              <span data-teamname>{home.name}</span>
              {home.position != null && (
                <span className="ml-1 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
                  [{home.position}]
                </span>
              )}
            </div>
            {homeStarter && (
              <div className="truncate text-[10px] text-neutral-500 dark:text-neutral-500">
                투수 {homeStarter}
              </div>
            )}
          </div>
          <Logo url={home.logo} name={home.name} />
        </TeamNameCell>
      </div>

      {/* 상황 박스 (LIVE 만) — 다이아몬드 + 주자/아웃 + 우측 빈 공간엔 AI 코멘터리 */}
      {isLive && (
        <div className="rounded-xl px-3 py-2.5 flex items-center gap-3 bg-neutral-50 border border-neutral-200/80 dark:bg-white/[.02] dark:border-white/[.06]">
          <BaseDiamond bases={bases} size={64} />
          <div className="shrink-0">
            <div className="text-[11px] text-neutral-500 dark:text-neutral-500 mb-1">
              {bases ? basesText(bases) : "주자 정보 없음"}
            </div>
            <div className="flex items-center gap-2">
              <OutCount outs={outs} />
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400 tabular-nums">
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
              <tr className="text-neutral-500 dark:text-neutral-500">
                <th className="text-left font-semibold py-1 pr-1.5 sm:pr-2 w-9 sm:w-10">팀</th>
                {inningIdx.map((i) => {
                  const isCurrent = isLive && inning != null && i + 1 === inning;
                  return (
                    <th
                      key={i}
                      className={`text-center py-1 px-0 tabular-nums ${
                        isCurrent
                          ? "text-emerald-600 dark:text-emerald-400 font-semibold"
                          : "text-neutral-400 dark:text-slate-600 font-medium"
                      }`}
                    >
                      {i + 1}
                    </th>
                  );
                })}
                <th className="text-center font-bold py-1 pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 tabular-nums text-neutral-700 dark:text-neutral-200">
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
      {actions && (
        <div className="flex items-center justify-end gap-1.5 px-3 sm:px-4 pb-3 sm:pb-4">
          {actions}
        </div>
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
      <td className="py-1 pr-1.5 sm:pr-2 font-bold text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
        {label}
      </td>
      {Array.from({ length: innings }, (_, i) => {
        const v = line[i];
        const isCurrent = currentInning != null && i + 1 === currentInning;
        const filled = v != null;
        return (
          <td
            key={i}
            className={`text-center tabular-nums py-1 px-0 ${
              isCurrent ? "bg-emerald-500/10 rounded" : ""
            } ${
              filled
                ? "text-neutral-700 dark:text-slate-200"
                : "text-neutral-300 dark:text-slate-700"
            }`}
          >
            {v ?? "·"}
          </td>
        );
      })}
      <td
        className={`text-center font-black py-1 pl-1.5 sm:pl-2 pr-0.5 sm:pr-1 tabular-nums ${
          win
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-neutral-800 dark:text-slate-200"
        }`}
        style={win ? { textShadow: "0 0 8px rgba(34,197,94,.35)" } : undefined}
      >
        {r}
      </td>
      <td className="text-center py-1 px-0.5 sm:px-1 tabular-nums text-neutral-500 dark:text-neutral-400">
        {h ?? "-"}
      </td>
      <td className="text-center py-1 pl-0.5 sm:pl-1 tabular-nums text-neutral-500 dark:text-neutral-400">
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
