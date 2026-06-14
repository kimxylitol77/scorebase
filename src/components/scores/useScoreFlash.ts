// 점수 변화(득점) 감지 hook — 직전 점수보다 오른 쪽의 ping 카운터를 +1.
// 반환된 ping 값을 halo span 의 key 로 쓰면 득점할 때마다 애니메이션이 재시작된다.
// - 첫 마운트(prev 없음)·enabled=false 면 ping 증가 안 함 (페이지 진입 시 flash X).
// - /scores 는 LiveRefresher 가 10초마다 router.refresh() 로 서버 리렌더하지만,
//   stable key(matchId) 로 컴포넌트 인스턴스가 reconcile 보존되므로 prevRef 가 유지됨.
// BaseballScore(큰 카드) · SoccerLiveRow(작은 행 데스크탑) · MobileCells(작은 행 모바일) 공용.

"use client";

import { useEffect, useRef, useState } from "react";

export function useScoreFlash(
  awayScore: number,
  homeScore: number,
  enabled: boolean,
): {
  awayPing: number;
  homePing: number;
  /** 방금 득점한 측 — 점수 증가 후 ~6초간 set, 그 뒤 자동 null. 골 임팩트 flash 용
   *  (incident 기반 recentGoalSide 가 ts incidents 지연/누락으로 못 뜰 때의 확실한 백업). */
  flashSide: "home" | "away" | null;
} {
  const prevRef = useRef<{ away: number; home: number } | null>(null);
  const [awayPing, setAwayPing] = useState(0);
  const [homePing, setHomePing] = useState(0);
  const [flashSide, setFlashSide] = useState<"home" | "away" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { away: awayScore, home: homeScore };
    if (!prev || !enabled) return;
    let side: "home" | "away" | null = null;
    if (homeScore > prev.home) {
      setHomePing((n) => n + 1);
      side = "home";
    }
    if (awayScore > prev.away) {
      setAwayPing((n) => n + 1);
      side = "away";
    }
    if (!side) return;
    setFlashSide(side);
    // deps 가 점수라 다음 득점마다 cleanup→재설정 = 연속골도 타이머 연장.
    const t = setTimeout(() => setFlashSide(null), 6000);
    return () => clearTimeout(t);
  }, [awayScore, homeScore, enabled]);

  return { awayPing, homePing, flashSide };
}
