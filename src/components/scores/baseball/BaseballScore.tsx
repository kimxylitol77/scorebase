// 야구 카드 점수 칸 — 리드 측 숫자 강조(emerald). 득점 halo flash 는 제거 (2026-08-30 사용자: 반복 발화 거슬림).

"use client";


export interface BaseballScoreProps {
  awayScore: number;
  homeScore: number;
  /** awayWin || liveAwayLead — 리드/승리 팀 emerald 강조 */
  awayHighlight: boolean;
  homeHighlight: boolean;
  isLive: boolean;
}

export default function BaseballScore({
  awayScore,
  homeScore,
  awayHighlight,
  homeHighlight,
}: BaseballScoreProps) {
  const numClass = (hi: boolean) =>
    `relative isolate inline-block ${
      hi
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-neutral-900 dark:text-slate-200"
    }`;
  const numStyle = (hi: boolean) =>
    hi ? { textShadow: "0 0 12px rgba(34,197,94,.35)" } : undefined;

  return (
    <>
      <span className={numClass(awayHighlight)} style={numStyle(awayHighlight)}>
                {awayScore}
      </span>
      <span className="mx-1.5 text-neutral-300 dark:text-neutral-600 font-thin">
        :
      </span>
      <span className={numClass(homeHighlight)} style={numStyle(homeHighlight)}>
                {homeScore}
      </span>
    </>
  );
}
