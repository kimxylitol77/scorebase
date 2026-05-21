// 모바일 1행 축구 row — AiScore 스타일.
// [★] [시간/상태] [홈 로고+이름 / 어웨이 로고+이름] [홈 점수 / 어웨이 점수]
// 컨테이너에서 divide-y 처리 — row 자체엔 border 없음.

"use client";

import Link from "next/link";
import FavoriteStar from "../FavoriteStar";
import { teamColor } from "@/lib/team-colors";
import { getLeagueBadge } from "./leagueBadge";

interface Props {
  matchId: string | number;
  league: string;
  status: "scheduled" | "live" | "finished" | "postponed";
  /** "16:30" KST */
  timeLabel: string;
  /** "전반 23'", "HT" 등 */
  liveStatusLabel?: string | null;
  home: { name: string; logo?: string | null; score: number | null };
  away: { name: string; logo?: string | null; score: number | null };
  previewSlug?: string | null;
  recapSlug?: string | null;
  recentGoalSide?: "home" | "away" | null;
  href?: string | null;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        className="w-4 h-4 object-contain shrink-0"
        loading="lazy"
      />
    );
  }
  return (
    <span className="w-4 h-4 inline-flex items-center justify-center text-[9px] font-bold text-neutral-400 bg-white/5 rounded-full shrink-0">
      {name.slice(0, 1)}
    </span>
  );
}

export default function SoccerCompactCard(props: Props) {
  const {
    matchId,
    league,
    status,
    timeLabel,
    liveStatusLabel,
    home,
    away,
    recentGoalSide,
    href,
  } = props;
  const badge = getLeagueBadge(league);

  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";
  // SCHEDULED 매치는 score 무시 (collector 잔여 데이터로 미래 매치에 점수 표시되는 버그 회피)
  const hasScore = (isLive || isFinished) && home.score != null && away.score != null;
  const homeWin = hasScore && home.score! > away.score!;
  const awayWin = hasScore && away.score! > home.score!;

  // 좌측 시간/상태 라벨 — 라이브: 분, 종료: "종료", 예정: 시간
  const leftPrimary = isLive
    ? liveStatusLabel || "LIVE"
    : isPostponed
      ? "연기"
      : isFinished
        ? "종료"
        : timeLabel;
  const leftClass = isLive
    ? "text-rose-500 font-bold"
    : isFinished
      ? "text-neutral-500"
      : "text-neutral-700 dark:text-neutral-300";

  const teamNameClass = (lost: boolean) =>
    `flex-1 truncate text-[13px] font-semibold ${
      lost
        ? "text-neutral-500 dark:text-neutral-500"
        : "text-neutral-900 dark:text-neutral-100"
    }`;

  const scoreClass = (win: boolean, lost: boolean) =>
    `tabular-nums text-[14px] font-bold leading-tight ${
      isLive
        ? "text-rose-600 dark:text-rose-400"
        : win
          ? "text-neutral-900 dark:text-neutral-100"
          : lost
            ? "text-neutral-500"
            : "text-neutral-700 dark:text-neutral-300"
    }`;

  const homeColor = teamColor(home.name);
  const awayColor = teamColor(away.name);

  const row = (
    <div
      className="flex items-center gap-2 px-2 py-2 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-white/[0.03] transition-colors border-l-[3px]"
      style={homeColor ? { borderLeftColor: homeColor } : undefined}
    >
      {/* ★ */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <FavoriteStar matchId={String(matchId)} />
      </div>

      {/* 시간/상태 + 리그명 — 2줄, 가운데 정렬, 폭 확장 (리그명 노출) */}
      <div className="shrink-0 w-16 text-center leading-tight">
        <div className={`text-[11px] ${leftClass}`}>{leftPrimary}</div>
        <div className="text-[9px] font-semibold text-neutral-500 dark:text-neutral-400 mt-0.5 truncate">
          {badge.label}
        </div>
      </div>

      {/* 팀 2줄 — 최근 골 측 row flash (7m 스타일) */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          className={`flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 transition ${
            recentGoalSide === "home"
              ? "bg-amber-300/40 dark:bg-amber-400/25 ring-1 ring-amber-400 animate-pulse"
              : ""
          }`}
        >
          {homeColor && (
            <span
              className="inline-block w-1 h-3 rounded-sm shrink-0"
              style={{ background: homeColor }}
              aria-hidden
            />
          )}
          <TeamLogo url={home.logo} name={home.name} />
          <span className={teamNameClass(hasScore && !homeWin && !isLive)}>
            {home.name}
          </span>
          {recentGoalSide === "home" && (
            <span className="ml-auto text-[9px] font-extrabold text-amber-700 dark:text-amber-300 animate-pulse whitespace-nowrap">
              ⚽
            </span>
          )}
        </div>
        <div
          className={`flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 transition ${
            recentGoalSide === "away"
              ? "bg-amber-300/40 dark:bg-amber-400/25 ring-1 ring-amber-400 animate-pulse"
              : ""
          }`}
        >
          {awayColor && (
            <span
              className="inline-block w-1 h-3 rounded-sm shrink-0"
              style={{ background: awayColor }}
              aria-hidden
            />
          )}
          <TeamLogo url={away.logo} name={away.name} />
          <span className={teamNameClass(hasScore && !awayWin && !isLive)}>
            {away.name}
          </span>
          {recentGoalSide === "away" && (
            <span className="ml-auto text-[9px] font-extrabold text-amber-700 dark:text-amber-300 animate-pulse whitespace-nowrap">
              ⚽
            </span>
          )}
        </div>
      </div>

      {/* 점수 2줄 */}
      <div className="shrink-0 w-7 flex flex-col items-end gap-1">
        <span
          className={`${scoreClass(homeWin, hasScore && !homeWin)} ${
            recentGoalSide === "home"
              ? "px-1 rounded ring-2 ring-amber-400 bg-amber-100/40 dark:bg-amber-500/15 animate-pulse"
              : ""
          }`}
        >
          {home.score ?? "-"}
        </span>
        <span
          className={`${scoreClass(awayWin, hasScore && !awayWin)} ${
            recentGoalSide === "away"
              ? "px-1 rounded ring-2 ring-amber-400 bg-amber-100/40 dark:bg-amber-500/15 animate-pulse"
              : ""
          }`}
        >
          {away.score ?? "-"}
        </span>
      </div>
    </div>
  );

  if (!href) return row;
  return (
    <Link href={href} prefetch={false} className="block">
      {row}
    </Link>
  );
}
