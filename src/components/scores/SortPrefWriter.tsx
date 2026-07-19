"use client";

// 축구 정렬 선택(리그별/시간순)을 쿠키에 기억 — URL 에 sort 파라미터가 명시된 렌더에서만 기록.
// 스코어보드.kr 처럼 루트(파라미터 없는 주소)로 재진입해도 마지막 선택이 유지되게 한다.
import { useEffect } from "react";

export default function SortPrefWriter({ explicitSort }: { explicitSort: "league" | "time" | null }) {
  useEffect(() => {
    if (!explicitSort) return;
    document.cookie = `scores_sort=${explicitSort};path=/;max-age=31536000;samesite=lax`;
  }, [explicitSort]);
  return null;
}
