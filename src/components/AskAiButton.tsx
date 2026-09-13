// 헤더 "AI에게 묻기" 진입점 — 경기 밖에서도 예측 데이터를 자연어로 묻게 한다(Dimers Dimebot 벤치마크, 2026-09-13).
// 챗봇 자체는 건드리지 않고 open-chat 이벤트만 쏜다. 모바일 메뉴에선 메뉴를 닫은 뒤 연다.
"use client";

import { Sparkles } from "lucide-react";
import { openChat } from "@/lib/open-chat-event";

export default function AskAiButton({ variant = "icon", onOpen }: { variant?: "icon" | "menu"; onOpen?: () => void }) {
  const handle = () => {
    onOpen?.();
    openChat();
  };
  if (variant === "menu") {
    return (
      <button
        type="button"
        onClick={handle}
        className="flex w-full items-center justify-center gap-2 mb-3 px-4 py-3 rounded-xl border-2 border-violet-300 dark:border-violet-500/40 bg-violet-50 dark:bg-violet-500/10 font-bold text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/15 transition"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        AI에게 묻기 <span className="text-xs font-medium opacity-70">오늘 고확신 픽 · 오버 값 경기</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={handle}
      aria-label="AI에게 묻기"
      title="AI에게 묻기 — 오늘 고확신 픽, KBO 오버 값 경기 등"
      className="inline-flex items-center gap-1.5 h-10 px-3 rounded-md text-sm font-semibold text-violet-700 dark:text-violet-300 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition"
    >
      <Sparkles className="h-4 w-4" aria-hidden />
      <span className="hidden xl:inline">AI에게 묻기</span>
    </button>
  );
}
