// scores__soccer__SoccerCompactCard (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

"use client";

import { useState } from "react";
import Link from "next/link";
import FavoriteStar from "../FavoriteStar";
import TeamNameCell from "../../../scores/TeamNameCell";
import { teamColor } from "@/lib/team-colors";
import { useScoreFlash } from "../../../scores/useScoreFlash";
import { getLeagueBadge } from "./leagueBadge";

interface Props {
  matchId: string | number;
  league: string;
  /** 시간순 평면 뷰 등 그룹 카드 밖 — 리그 배지를 행 안에 표시 */
  showLeague?: boolean;
  status: "scheduled" | "live" | "finished" | "postponed";
  /** "16:30" KST */
  timeLabel: string;
  /** "전반 23'", "HT" 등 */
  liveStatusLabel?: string | null;
  home: { name: string; logo?: string | null; score: number | null };
  away: { name: string; logo?: string | null; score: number | null };
  previewSlug?: string | null;
  recapSlug?: string | null;
  href?: string | null;
  /** 축구 승부차기 — 정규/연장 동점 후 PK. 점수 옆 (4) 표시 */
  penaltyHome?: number | null;
  penaltyAway?: number | null;
}

function TeamLogo({ url, name }: { url?: string | null; name: string }) {
  // 군소팀 로고 URL 이 404(이미지 없음)면 onError 로 이니셜 fallback. (af KFA컵 등)
  const [err, setErr] = useState(false);
  if (url && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt=""
        onError={() => setErr(true)}
        className="w-4 h-4 object-contain shrink-0 bg-white rounded-sm p-0.5"
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
    showLeague,
    status,
    timeLabel,
    liveStatusLabel,
    home,
    away,
    href,
    penaltyHome,
    penaltyAway,
  } = props;
  const leagueBadge = showLeague ? getLeagueBadge(league) : null;
  const isLive = status === "live";
  const isFinished = status === "finished";
  const isPostponed = status === "postponed";
  // SCHEDULED·연기 매치는 score 무시 (collector 잔여 데이터로 미래 매치에 점수 표시되는 버그 회피).
  // 2026-08-22 — 이 값을 계산해 두고 정작 점수 출력에는 안 써서 연기 경기가 "0 0 연기" 로 나갔다
  // (스위스 슈퍼리그·체코 1부·MLS 등 361건). 출력·스타일 양쪽에 반드시 이 게이트를 통과시킬 것.
  const hasScore = (isLive || isFinished) && home.score != null && away.score != null;
  const homeWin = hasScore && home.score! > away.score!;
  const awayWin = hasScore && away.score! > home.score!;
  // 골 임팩트 = 점수 기반 flashSide(6초). 긴 incident 윈도우(recentGoalSide, ~3분 잔존) 제거
  // — 점수가 빨라져 불필요, "너무 오래 떠 있음" 해소 (2026-06-14).
  const { flashSide } = useScoreFlash(away.score ?? 0, home.score ?? 0, isLive);
  const goalFlashSide = flashSide;

  // 좌측 시간/상태 라벨 — 라이브: 분, 종료: "종료", 예정: 시간
  const leftPrimary = isLive
    ? liveStatusLabel || "LIVE"
    : isPostponed
      ? "PP"
      : isFinished
        ? "FT"
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
      className={`flex items-center gap-2 px-3 py-2.5 transition-colors ${
        isLive
          ? "bg-rose-50/70 dark:bg-rose-500/[0.07] border-l-[3px] border-rose-500"
          : "hover:bg-neutral-50 dark:hover:bg-white/[0.03]"
      }`}
    >
      {/* ★ */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <FavoriteStar
          matchId={String(matchId)}
          meta={{
            id: String(matchId),
            sport: "soccer",
            league,
            homeName: home.name,
            awayName: away.name,
            homeScore: home.score,
            awayScore: away.score,
            status,
            statusLabel: liveStatusLabel ?? timeLabel,
            href: href ?? undefined,
          }}
        />
      </div>

      {/* 시간/상태 — 리그명은 그룹 카드 헤더로 이동 (showLeague=시간순 평면 뷰만 배지 표시) */}
      <div className={`shrink-0 ${leagueBadge ? "w-14" : "w-12"} text-center leading-tight`}>
        <div className={`text-[11px] ${leftClass}`}>{leftPrimary}</div>
        {leagueBadge && (
          <div
            className="mt-0.5 text-[9px] font-bold rounded-sm px-0.5 py-px truncate"
            style={{ background: leagueBadge.bg, color: leagueBadge.fg }}
            title={leagueBadge.label}
          >
            {leagueBadge.label}
          </div>
        )}
      </div>

      {/* 팀 2줄 — 최근 골 측 row flash (7m 스타일) */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <TeamNameCell
          className={`flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 transition ${
            goalFlashSide === "home"
              ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
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
          <span
            className={
              goalFlashSide === "home"
                ? "truncate text-[13px] font-bold text-emerald-800 dark:text-emerald-200"
                : teamNameClass(hasScore && !homeWin && !isLive)
            }
          >
            <span data-teamname>{home.name}</span>
          </span>
          {goalFlashSide === "home" && (
            <span className="ml-auto text-[9px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
              ⚽
            </span>
          )}
        </TeamNameCell>
        <TeamNameCell
          className={`flex items-center gap-1.5 min-w-0 rounded-md px-1 py-0.5 transition ${
            goalFlashSide === "away"
              ? "bg-emerald-400/45 dark:bg-emerald-500/30 ring-2 ring-emerald-500 animate-pulse"
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
          <span
            className={
              goalFlashSide === "away"
                ? "truncate text-[13px] font-bold text-emerald-800 dark:text-emerald-200"
                : teamNameClass(hasScore && !awayWin && !isLive)
            }
          >
            <span data-teamname>{away.name}</span>
          </span>
          {goalFlashSide === "away" && (
            <span className="ml-auto text-[9px] font-extrabold text-emerald-700 dark:text-emerald-300 animate-pulse whitespace-nowrap">
              ⚽
            </span>
          )}
        </TeamNameCell>
      </div>

      {/* 점수 2줄 — 골 강조는 팀 칸에만. 승부차기는 점수 우측에 작게 (홈줄 (4) / 원정줄 (3)) */}
      <div className="shrink-0 w-auto min-w-[1.75rem] flex flex-col items-end gap-1">
        <span className={scoreClass(homeWin, hasScore && !homeWin)}>
          {penaltyHome != null && (
            <span className="mr-0.5 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 align-middle">
              ({penaltyHome})
            </span>
          )}
          {hasScore ? home.score : "-"}
        </span>
        <span
          className={scoreClass(awayWin, hasScore && !awayWin)}
        >
          {penaltyAway != null && (
            <span className="mr-0.5 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 align-middle">
              ({penaltyAway})
            </span>
          )}
          {hasScore ? away.score : "-"}
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
