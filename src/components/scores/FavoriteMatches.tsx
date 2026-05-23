// /scores 페이지 최상단 "내 경기" 섹션.
// 모든 매치 list 를 props 로 받고, localStorage 의 fav id 들에 해당하는 매치만 노출.
// 종목별 그룹 (축구→야구→농구→하키→e스포츠), 각 그룹 안에서 LIVE → 예정 → 종료 순.
// 0개이면 섹션 자체 안 그림.

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

// 종목 표시 순서 + 메타 (이모지 / 한국어 라벨)
const SPORT_ORDER = ["soccer", "baseball", "basketball", "hockey", "esports"] as const;
const SPORT_META: Record<string, { label: string; emoji: string }> = {
  soccer: { label: "축구", emoji: "⚽" },
  baseball: { label: "야구", emoji: "⚾" },
  basketball: { label: "농구", emoji: "🏀" },
  hockey: { label: "하키", emoji: "🏒" },
  esports: { label: "e스포츠", emoji: "🎮" },
};

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

  // 종목별 그룹화 — 그룹 안에선 이미 sortKey (LIVE→예정→종료) 순.
  const grouped = new Map<string, MatchEntry[]>();
  for (const m of fav) {
    const arr = grouped.get(m.sport) ?? [];
    arr.push(m);
    grouped.set(m.sport, arr);
  }
  // 등록된 종목 순서 + 등록 안 된 (예외) 종목 끝에
  const sportOrder = [
    ...SPORT_ORDER.filter((s) => grouped.has(s)),
    ...[...grouped.keys()].filter((s) => !SPORT_ORDER.includes(s as typeof SPORT_ORDER[number])),
  ];

  const renderMatch = (m: MatchEntry) => (
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
  );

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold tracking-tight">⭐ 내 경기</h2>
        <span className="text-[11px] text-neutral-400 tabular-nums">
          {fav.length}경기 · {sportOrder.length}종목
        </span>
      </div>
      {sportOrder.map((sport) => {
        const list = grouped.get(sport) ?? [];
        if (list.length === 0) return null;
        const meta = SPORT_META[sport] ?? { label: sport, emoji: "🏆" };
        return (
          <div key={sport} className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-base" aria-hidden>
                {meta.emoji}
              </span>
              <h3 className="text-[13px] font-semibold tracking-tight text-neutral-700 dark:text-neutral-300">
                {meta.label}
              </h3>
              <span className="text-[11px] text-neutral-400 tabular-nums">
                {list.length}경기
              </span>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {list.map(renderMatch)}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
