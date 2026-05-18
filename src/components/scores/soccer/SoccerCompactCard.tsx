// 모바일 2칸 grid 용 축구 카드 — 야구 박스 스타일 (세로 한 줄에 한 팀).
// 헤더: 리그 배지 + 시간/상태
// 본문: away (로고 이름 점수) / home (로고 이름 점수)
// 푸터: P/R 아이콘 + 즐겨찾기

"use client";

import Link from "next/link";
import { getLeagueBadge } from "./leagueBadge";
import { teamColor } from "@/lib/team-colors";
import FavoriteStar from "../FavoriteStar";

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
    return <img src={url} alt="" className="w-5 h-5 object-contain shrink-0" loading="lazy" />;
  }
  return (
    <span className="w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold text-neutral-400 bg-white/5 rounded-full shrink-0">
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
    previewSlug,
    recapSlug,
    recentGoalSide,
    href,
  } = props;

  const badge = getLeagueBadge(league);
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";
  const hasScore = home.score != null && away.score != null;
  const homeWin = hasScore && home.score! > away.score!;
  const awayWin = hasScore && away.score! > home.score!;

  // 상태 텍스트
  const statusText = isLive
    ? liveStatusLabel || "LIVE"
    : isPostponed
      ? "연기"
      : isFinished
        ? "종료"
        : timeLabel;
  const statusColor = isLive
    ? "text-rose-500"
    : isFinished
      ? "text-neutral-500"
      : "text-neutral-500";

  const homeColor = teamColor(home.name);

  const cardBody = (
    <div
      className="rounded-xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-950 overflow-hidden border-l-[3px]"
      style={homeColor ? { borderLeftColor: homeColor } : undefined}
    >
      {/* 헤더: 리그 배지 + 상태/시간 */}
      <div
        className="flex items-center justify-between gap-1 px-2 py-1"
        style={{ background: badge.bg, color: badge.fg }}
      >
        <span className="text-[10px] font-bold tracking-wider truncate">{badge.label}</span>
        <span className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${isLive ? "" : "opacity-80"}`}>
          {statusText}
        </span>
      </div>

      {/* 본문: away 위, home 아래 (한 줄에 한 팀, 풀네임 truncate) */}
      <div className="px-2 py-2 space-y-1">
        <TeamRow
          team={away}
          win={awayWin}
          highlight={recentGoalSide === "away"}
          dim={hasScore && !awayWin && !isLive}
        />
        <TeamRow
          team={home}
          win={homeWin}
          highlight={recentGoalSide === "home"}
          dim={hasScore && !homeWin && !isLive}
        />
      </div>

      {/* 푸터: P/R 글 아이콘 + 즐겨찾기 (별도 시간 표시 X — 헤더에 있음) */}
      <div className="flex items-center justify-between px-2 py-1.5 border-t border-neutral-100 dark:border-white/5">
        <div className="flex items-center gap-1">
          {previewSlug && (
            <Link
              href={`/articles/${previewSlug}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              title="프리뷰"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
            >
              P
            </Link>
          )}
          {recapSlug && (
            <Link
              href={`/articles/${recapSlug}`}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              title="리뷰"
              className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            >
              R
            </Link>
          )}
        </div>
        <FavoriteStar matchId={String(matchId)} />
      </div>
    </div>
  );

  if (!href) return cardBody;
  return (
    <Link href={href} prefetch={false} className="block">
      {cardBody}
    </Link>
  );
}

function TeamRow({
  team,
  win,
  highlight,
  dim,
}: {
  team: { name: string; logo?: string | null; score: number | null };
  win: boolean;
  highlight: boolean;
  dim: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <TeamLogo url={team.logo} name={team.name} />
      <span
        className={`flex-1 truncate text-[13px] font-bold ${
          dim ? "text-neutral-500 dark:text-neutral-500" : "text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {team.name}
      </span>
      <span
        className={`tabular-nums text-[15px] font-black min-w-[20px] text-right ${
          highlight
            ? "px-1 rounded ring-2 ring-amber-400 bg-amber-100/40 dark:bg-amber-500/15 animate-pulse"
            : ""
        } ${
          win
            ? "text-rose-600 dark:text-rose-400"
            : dim
              ? "text-neutral-500"
              : "text-neutral-800 dark:text-neutral-200"
        }`}
      >
        {team.score ?? "-"}
      </span>
    </div>
  );
}
