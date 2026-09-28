"use client";
// 스코어보드 보기 한 줄 — 득점을 감지해 data-goal="home|away" 를 몇 초간 단다.
// 연출은 globals.css 의 [data-goal] 규칙(초록 스윕·GOAL 전광판 표시·숫자 뒤집기)이 맡는다. 카드 보기(호박색 링)와 일부러 다르다.
// 골 소리는 전 페이지 공통 LiveScoresBar 의 chime 이 그대로 맡는다(전용 골 혼은 사용자 청취 후 반려, 2026-09-28).
import type { ReactNode } from "react";
import { useScoreFlash } from "../useScoreFlash";

export default function ScoreboardGoalRow({
  live, homeScore, awayScore, className, children,
}: {
  live: boolean;
  homeScore: number | null;
  awayScore: number | null;
  className: string;
  children: ReactNode;
}) {
  const { flashSide } = useScoreFlash(awayScore ?? 0, homeScore ?? 0, live);
  return (
    <div data-goal={flashSide ?? undefined} className={`sb-row ${className}`}>
      {children}
    </div>
  );
}
