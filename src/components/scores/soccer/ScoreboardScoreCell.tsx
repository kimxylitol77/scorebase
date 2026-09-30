"use client";
// 스코어보드 보기 점수 칸 — 진행·종료 경기는 마우스를 올리면 득점·카드 타임라인과 팀 통계 툴팁(시간순 목록과 같은 GoalsTooltip).
import { useState } from "react";
import Link from "next/link";
import type { SoccerGoal, SoccerCard, SoccerTeamStat } from "@/lib/sports/live-scores";
import { GoalsTooltip } from "./SoccerLiveRow";

export default function ScoreboardScoreCell({
  href,
  scored,
  homeScore,
  awayScore,
  half,
  htLabel,
  sub,
  goals,
  cards,
  teamStats,
  halfStats,
  homeLabel,
  awayLabel,
}: {
  href: string | null;
  scored: boolean;
  homeScore: number | null;
  awayScore: number | null;
  half: { home: number; away: number } | null;
  htLabel: string;
  sub?: string | null;
  goals: SoccerGoal[];
  cards: SoccerCard[];
  teamStats: SoccerTeamStat[];
  halfStats: SoccerTeamStat[];
  homeLabel: string;
  awayLabel: string;
}) {
  const [pos, setPos] = useState<{ x: number; bottom: number } | null>(null);
  const hasTip = scored && (goals.length > 0 || cards.length > 0 || teamStats.length > 0 || halfStats.length > 0);
  return (
    <div
      className="relative text-center leading-tight"
      onMouseEnter={
        hasTip
          ? (e) => {
              // 화면 가장자리 클램프 — 시간순 목록(SoccerLiveRow)과 같은 좌표 규칙
              const r = e.currentTarget.getBoundingClientRect();
              setPos({ x: Math.min(Math.max(r.left + r.width / 2, 152), window.innerWidth - 152), bottom: r.bottom });
            }
          : undefined
      }
      onMouseLeave={hasTip ? () => setPos(null) : undefined}
    >
      <Link href={href ?? "#"} prefetch={false} className="block">
        <span className={`block text-[15px] font-bold tabular-nums ${scored ? "text-neutral-900 dark:text-white" : "text-neutral-400"}`}>
          {scored && homeScore != null && awayScore != null ? (
            // 팀별 숫자를 나눠 둔다 — 득점한 쪽 숫자만 뒤집기 연출(globals.css [data-goal])
            <>
              <span className="sb-digit-home inline-block">{homeScore}</span> - <span className="sb-digit-away inline-block">{awayScore}</span>
            </>
          ) : (
            "vs"
          )}
        </span>
        {half && scored ? (
          <span className="block text-[10px] tabular-nums text-neutral-400">
            {htLabel} {half.home}-{half.away}
          </span>
        ) : sub && scored ? (
          <span className="block whitespace-nowrap text-[10px] text-neutral-400">{sub}</span>
        ) : null}
      </Link>
      {hasTip && (
        <GoalsTooltip
          goals={goals}
          cards={cards}
          teamStats={teamStats}
          halfStats={halfStats}
          homeLabel={homeLabel}
          awayLabel={awayLabel}
          pos={pos}
          onClose={() => setPos(null)}
        />
      )}
    </div>
  );
}
