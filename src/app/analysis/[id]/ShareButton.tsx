"use client";
// 글 공유 버튼 — 모바일은 OS 공유 시트(navigator.share), 미지원 환경은 링크 복사.

import { useState } from "react";

export default function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // 사용자가 시트를 닫음 — 복사 폴백으로 내려가지 않고 종료
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard 불가 환경 — 무시
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      title="이 글 공유하기"
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 px-5 py-2 text-sm font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M12 3v13M7 8l5-5 5 5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {copied ? "링크 복사됨" : "공유"}
    </button>
  );
}
