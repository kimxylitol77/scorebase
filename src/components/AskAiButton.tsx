// 모바일 메뉴 "AI에게 묻기" 버튼 — 경기 밖에서도 예측 데이터를 자연어로 묻게 한다(Dimers Dimebot 벤치마크, 2026-09-13).
// 챗봇 자체는 건드리지 않고 open-chat 이벤트만 쏜다. 메뉴를 닫은 뒤 연다.
// 데스크톱 헤더 아이콘 버튼은 폭을 넘겨 「AI 분석실」 드롭다운 항목(NavDropdown, action:"open-chat")으로 옮겼다.
"use client";

import { Sparkles } from "lucide-react";
import { openChat } from "@/lib/open-chat-event";

export default function AskAiButton({ onOpen }: { onOpen?: () => void }) {
  const handle = () => {
    onOpen?.();
    openChat();
  };
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
