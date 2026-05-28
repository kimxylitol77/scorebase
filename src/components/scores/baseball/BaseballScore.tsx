// 야구 카드 점수 칸 — 득점 순간(직전 점수보다 오르면) 그 팀 숫자 뒤에
// 배경 광채(halo) flash 를 1.5초 띄운다. /scores 는 LiveRefresher 가 15초마다
// router.refresh() 로 서버 리렌더 → 이 클라이언트 컴포넌트 인스턴스는 stable key
// (matchId) 로 reconcile 보존되므로 prevRef 로 점수 증가 감지 가능.
// LIVE 매치에서만 flash (종료/예정 카드엔 안 뜸).

"use client";

import { useScoreFlash } from "../useScoreFlash";

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
  isLive,
}: BaseballScoreProps) {
  // 득점할 때마다 ping +1 — halo span 의 key 로 써서 애니메이션을 매번 재시작.
  const { awayPing, homePing } = useScoreFlash(awayScore, homeScore, isLive);

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
        {awayPing > 0 && (
          <span key={awayPing} className="score-halo-burst" aria-hidden />
        )}
        {awayScore}
      </span>
      <span className="mx-1.5 text-neutral-300 dark:text-neutral-600 font-thin">
        :
      </span>
      <span className={numClass(homeHighlight)} style={numStyle(homeHighlight)}>
        {homePing > 0 && (
          <span key={homePing} className="score-halo-burst" aria-hidden />
        )}
        {homeScore}
      </span>
    </>
  );
}
