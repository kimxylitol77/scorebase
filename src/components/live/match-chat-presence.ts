"use client";
// 경기 챗봇이 지금 화면에 떠 있는지 알리는 신호 — 전역 플로팅 챗봇이 자리를 비켜주기 위함.
//
// 왜 경로 판정이 아닌가. 둘 다 우하단 고정이라 축구 경기 상세에서 겹치는데, 경로로
// "축구 상세면 전역 챗봇 숨김" 을 하면 **비회원**일 때 경기 챗봇(회원 전용)도 안 뜨고
// 전역 챗봇도 숨어 그 페이지에 챗봇이 아예 사라진다. 실제 표시 여부를 신호로 쓰면
// 회원 여부·종목·조건이 바뀌어도 자동으로 맞는다. use-me.ts 의 모듈 스코프 패턴과 동일.

import { useEffect, useState } from "react";

let mounted = false;
const listeners = new Set<() => void>();

/** 경기 챗봇 표시 상태 보고 — MatchChat 이 마운트/언마운트 시 호출. */
export function setMatchChatMounted(next: boolean): void {
  if (mounted === next) return;
  mounted = next;
  listeners.forEach((l) => l());
}

/** 경기 챗봇이 떠 있으면 true. */
export function useMatchChatMounted(): boolean {
  const [value, setValue] = useState(mounted);
  useEffect(() => {
    const sync = () => setValue(mounted);
    listeners.add(sync);
    sync(); // 구독 직전에 바뀐 값 반영
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return value;
}
