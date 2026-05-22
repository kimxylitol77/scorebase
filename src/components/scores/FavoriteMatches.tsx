// /scores 페이지 최상단 "내 경기" 섹션.
// 모든 매치 list 를 props 로 받고, localStorage 의 fav id 들에 해당하는 매치만 노출.
// fav 매치는 LIVE → 예정 → 종료 순. 0개이면 섹션 자체 안 그림.

"use client";

import { type ReactNode } from "react";
import MatchCard, { type MatchCardProps } from "./MatchCard";
import { useFavorites } from "./useFavorites";

interface MatchEntry extends Omit<MatchCardProps, "actions"> {
  id: string;
  /** 정렬용 — LIVE=0, SCHEDULED=1, FINISHED=2 */
  sortKey: number;
  actions?: ReactNode;
}

interface Props {
  matches: MatchEntry[];
}

export default function FavoriteMatches({ matches }: Props) {
  const { ids, mounted } = useFavorites();

  if (!mounted) return null; // SSR 단에는 표시 안 함 (hydration mismatch 방지)
  if (ids.size === 0) return null;

  const fav = matches
    .filter((m) => ids.has(m.id))
    .sort((a, b) => a.sortKey - b.sortKey);

  if (fav.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-300/50 dark:border-amber-500/30 p-4 text-center text-xs text-neutral-500">
        ⭐ 즐겨찾기한 경기가 오늘 일정에 없습니다.
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 px-1">
        <h2 className="text-sm font-bold tracking-tight">
          ⭐ 내 경기
        </h2>
        <span className="text-[11px] text-neutral-400 tabular-nums">
          {fav.length}경기
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fav.map((m) => (
          <MatchCard
            key={m.id}
            matchId={m.id}
            sport={m.sport}
            status={m.status}
            league={m.league}
            leagueLabel={m.leagueLabel}
            home={m.home}
            away={m.away}
            timeLabel={m.timeLabel}
            liveStatusLabel={m.liveStatusLabel}
            baseballCtx={m.baseballCtx}
            baseballLinescore={m.baseballLinescore}
            periodLinescore={m.periodLinescore}
            soccerGoals={m.soccerGoals}
            soccerCtx={m.soccerCtx}
            esportsCtx={m.esportsCtx}
            homeStarter={m.homeStarter}
            awayStarter={m.awayStarter}
            href={m.href}
            actions={m.actions}
            liveCommentary={m.liveCommentary}
          />
        ))}
      </ul>
    </section>
  );
}
