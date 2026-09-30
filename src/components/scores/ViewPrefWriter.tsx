"use client";
// 축구 외 종목 보기 선택(스코어보드/카드)을 쿠키에 기억 — URL 에 view 가 명시된 렌더에서만 기록한다.
import { useEffect } from "react";

export default function ViewPrefWriter({ explicitView }: { explicitView: "board" | "card" | null }) {
  useEffect(() => {
    if (!explicitView) return;
    document.cookie = `scores_view=${explicitView};path=/;max-age=31536000;samesite=lax`;
  }, [explicitView]);
  return null;
}
