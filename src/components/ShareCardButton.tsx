"use client";
// 범용 공유 버튼 — Web Share 우선, 미지원이면 링크 복사. 공유 카드 이미지 링크는 옵션.

import { useState } from "react";
import { Share2, ImageIcon } from "lucide-react";

type Props = {
  url: string; // 공유할 페이지 URL (절대/상대 모두 허용 — 상대면 현재 origin 붙임)
  title: string;
  text?: string;
  cardImageUrl?: string; // OG 공유 카드 이미지 경로 (새 탭으로 열어 저장/업로드)
};

export default function ShareCardButton({ url, title, text, cardImageUrl }: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const abs = url.startsWith("http") ? url : `${window.location.origin}${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url: abs });
        return;
      }
    } catch {
      // 사용자가 공유 시트를 닫은 경우 등 — 복사 폴백으로 진행하지 않고 종료
      return;
    }
    try {
      await navigator.clipboard.writeText(abs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard 미지원 브라우저는 무시 */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 ring-1 ring-blue-500/20 transition-all duration-300 hover:-translate-y-0.5 dark:text-blue-400"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        {copied ? "링크 복사됨" : "공유하기"}
      </button>
      {cardImageUrl && (
        <a
          href={cardImageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-500/10 px-3 py-1.5 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-500/20 transition-all duration-300 hover:-translate-y-0.5 dark:text-zinc-300"
        >
          <ImageIcon className="h-3.5 w-3.5" aria-hidden />
          공유 카드 이미지
        </a>
      )}
    </div>
  );
}
