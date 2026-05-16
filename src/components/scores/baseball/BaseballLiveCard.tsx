// /scores 야구 LIVE 매치 카드 — 가로 통합 디자인.
// 다이아몬드 + 이닝 박스 + R/H/E 한 카드에 통합.
// 점수/이닝 데이터는 baseballLinescore, 회/말은 statusLabel 파싱 ("5회 초"/"5회 말").
// bases/outs 는 현재 /scores 에서 미수집 → graceful degradation (빈 표시).

import Link from "next/link";
import type { ReactNode } from "react";
import type { BaseballLinescoreData } from "../BaseballLinescore";
import type { BaseballContext } from "../BaseballMiniBoard";
import FavoriteStar from "../FavoriteStar";
import BaseDiamond from "./BaseDiamond";
import OutCount from "./OutCount";

export interface BaseballLiveCardProps {
  matchId?: string | number;
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
  } = props;

  // 회/말 — ctx 우선, 없으면 statusLabel 파싱
  const parsed = parseInningFromLabel(liveStatusLabel);
  const inning = baseballCtx?.inning ?? parsed.inning;
  const half = baseballCtx?.half ?? parsed.half;
  const halfKo = half === "top" ? "초" : half === "bottom" ? "말" : "";
  // inning 정보 파싱 실패하면 inning 칸 숨김 (헤더 LIVE 배지로 충분).
  const inningText = inning ? `${inning}회 ${halfKo}`.trim() : null;

  const bases = baseballCtx?.bases ?? null;
  const outs = (baseballCtx?.outs ?? null) as 0 | 1 | 2 | 3 | null;

  const homeScore = home.score ?? 0;
  const awayScore = away.score ?? 0;
  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;

  // 이닝 박스 - 최소 9회까지, 연장은 max
  const ls = baseballLinescore;
  const totalInnings = Math.max(
    9,
    ls?.awayInnings.length ?? 0,
    ls?.homeInnings.length ?? 0,
  );
  const inningIdx = Array.from({ length: totalInnings }, (_, i) => i);

  const body = (
    <div className="p-3 sm:p-4 space-y-3">
      {/* 1) 헤더 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider"
            style={{
              background: "rgba(239,68,68,.18)",
              color: "#fca5a5",
            }}
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
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {leagueLabel ?? league}
          </span>
          {inningText && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {inningText}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-neutral-500 tabular-nums">{timeLabel}</span>
          {matchId != null && <FavoriteStar matchId={String(matchId)} className="-mr-1" />}
        </div>
      </div>

      {/* 2) 팀 + 점수 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
        {/* 원정 */}
        <div className="min-w-0 flex items-center gap-2">
          <Logo url={away.logo} name={away.name} />
          <div className="min-w-0">
            <div className="truncate text-xs sm:text-sm font-bold">{away.name}</div>
            {awayStarter && (
              <div className="truncate text-[10px] text-neutral-500">
                투수 {awayStarter}
              </div>
            )}
          </div>
        </div>

        {/* 점수 */}
        <div className="text-center font-black tabular-nums tracking-tight text-2xl sm:text-3xl">
          <span
            style={{
              color: awayWin ? "#22c55e" : "#cbd5e1",
              textShadow: awayWin ? "0 0 12px rgba(34,197,94,.45)" : "none",
            }}
          >
            {awayScore}
          </span>
          <span className="mx-1.5 text-neutral-500 font-thin">:</span>
          <span
            style={{
              color: homeWin ? "#22c55e" : "#cbd5e1",
              textShadow: homeWin ? "0 0 12px rgba(34,197,94,.45)" : "none",
            }}
          >
            {homeScore}
          </span>
        </div>

        {/* 홈 */}
        <div className="min-w-0 flex items-center gap-2 justify-end text-right">
          <div className="min-w-0">
            <div className="truncate text-xs sm:text-sm font-bold">{home.name}</div>
            {homeStarter && (
              <div className="truncate text-[10px] text-neutral-500">
                투수 {homeStarter}
              </div>
            )}
          </div>
          <Logo url={home.logo} name={home.name} />
        </div>
      </div>

      {/* 3) 상황 박스 (다이아몬드 + 아웃) */}
      <div
        className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
        style={{
          background: "rgba(255,255,255,.02)",
          border: "1px solid rgba(255,255,255,.06)",
        }}
      >
        <BaseDiamond bases={bases} size={64} />
        <div className="flex-1 min-w-0">
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
      </div>

      {/* 4) 이닝 박스 스코어 */}
      {ls && (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="text-[11px] sm:text-xs w-full min-w-[360px]">
            <thead>
              <tr className="text-neutral-500">
                <th className="text-left font-semibold py-1 pr-2 w-10">팀</th>
                {inningIdx.map((i) => {
                  const isCurrent = inning != null && i + 1 === inning;
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
                <th className="text-center font-bold py-1 pl-2 pr-1 tabular-nums text-neutral-200">
                  R
                </th>
                <th className="text-center font-semibold py-1 px-1 tabular-nums">H</th>
                <th className="text-center font-semibold py-1 pl-1 tabular-nums">E</th>
              </tr>
            </thead>
            <tbody>
              <BoxRow
                label={ls.awayLabel}
                line={ls.awayInnings}
                innings={totalInnings}
                currentInning={inning}
                r={ls.awayScore}
                h={ls.awayHits}
                e={ls.awayErrors}
                win={awayWin}
              />
              <BoxRow
                label={ls.homeLabel}
                line={ls.homeInnings}
                innings={totalInnings}
                currentInning={inning}
                r={ls.homeScore}
                h={ls.homeHits}
                e={ls.homeErrors}
                win={homeWin}
              />
            </tbody>
          </table>
        </div>
      )}

      {actions && (
        <div className="flex items-center justify-end gap-1.5">{actions}</div>
      )}
    </div>
  );

  const isExternal = href != null && /^https?:\/\//i.test(href);
  return (
    <li className="match-card baseball-live-card list-none">
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
      <td className="py-1 pr-2 font-bold text-neutral-300 whitespace-nowrap">
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
        className="text-center font-black py-1 pl-2 pr-1 tabular-nums"
        style={{
          color: win ? "#22c55e" : "#cbd5e1",
          textShadow: win ? "0 0 8px rgba(34,197,94,.45)" : "none",
        }}
      >
        {r}
      </td>
      <td className="text-center py-1 px-1 tabular-nums text-neutral-400">
        {h ?? "-"}
      </td>
      <td className="text-center py-1 pl-1 tabular-nums text-neutral-400">
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
