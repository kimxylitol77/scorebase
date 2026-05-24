// 숫자 prop 이 바뀌면 이전 값 → 새 값으로 부드럽게 카운트업.
// 라이브 스코어 변동 시 시각적 "라이브" 감 강화용. 변동 없으면 정적 렌더.

"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** 애니메이션 지속 시간 (ms) — 기본 500ms */
  durationMs?: number;
  className?: string;
}

export default function CountUp({ value, durationMs = 500, className }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (to - from) * eased);
      setDisplay(v);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, durationMs]);

  return <span className={className}>{display}</span>;
}
