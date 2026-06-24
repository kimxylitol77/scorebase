"use client";
// 드림팀 팀 공유 버튼 — Web Share API(모바일 카톡·스레드 네이티브 시트) + 데스크톱 클립보드 폴백.
// 빌더 저장 직후 · 팀 공유 페이지 공용.
import { useState } from "react";

export default function ShareButton({
  url,
  title,
  text,
  mine,
}: {
  url: string;
  title: string;
  text: string;
  mine: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title, text, url });
      } catch {
        // 사용자가 공유 시트를 닫음 — 무시
      }
      return;
    }
    try {
      await nav?.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한 거부 — 무시
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-rose-400 hover:text-rose-600 dark:border-neutral-700 dark:text-neutral-200 dark:hover:border-rose-500 dark:hover:text-rose-300"
    >
      {copied ? "링크 복사됨" : mine ? "내 팀 자랑하기" : "이 팀 공유"}
    </button>
  );
}
