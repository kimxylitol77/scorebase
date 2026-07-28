"use client";
// 범용 공유 버튼 — 클릭 시 메뉴: [링크 공유·복사(Web Share 우선)] / [자유게시판에 공유].
// 자유게시판은 /community/new 프리필(?stitle·spath)로 이동. 공유 카드 이미지 링크는 옵션.

import { useEffect, useRef, useState } from "react";
import { Share2, ImageIcon, Link2, MessagesSquare } from "lucide-react";

type Props = {
  /** 공유할 페이지 URL (절대/상대 모두 허용 — 상대면 현재 origin 붙임). 생략 시 현재 페이지. */
  url?: string;
  /** 생략 시 클릭 시점의 document.title 사용 (선수 페이지처럼 부모가 이름을 모를 때). */
  title?: string;
  text?: string;
  cardImageUrl?: string; // OG 공유 카드 이미지 경로 (새 탭으로 열어 저장/업로드)
};

export default function ShareCardButton({ url, title, text, cardImageUrl }: Props) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 메뉴 밖 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  function resolveTarget(): { abs: string; path: string; shareTitle: string } {
    const abs = url
      ? url.startsWith("http")
        ? url
        : `${window.location.origin}${url}`
      : window.location.href;
    // 자유게시판 프리필용 사이트 내 경로 (절대 URL 이면 pathname+search 만)
    const path = url
      ? url.startsWith("http")
        ? (() => {
            try {
              const u = new URL(url);
              return u.pathname + u.search;
            } catch {
              return window.location.pathname + window.location.search;
            }
          })()
        : url
      : window.location.pathname + window.location.search;
    // "… | Scorebase" 사이트 접미사는 게시글 제목에서 제거
    const shareTitle = (title ?? document.title).replace(/\s*\|\s*Scorebase\s*$/, "");
    return { abs, path, shareTitle };
  }

  async function shareLink() {
    setOpen(false);
    const { abs, shareTitle } = resolveTarget();
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text, url: abs });
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

  function shareToBoard() {
    const { path, shareTitle } = resolveTarget();
    window.location.href = `/community/new?stitle=${encodeURIComponent(shareTitle.slice(0, 90))}&spath=${encodeURIComponent(path)}`;
  }

  return (
    <div ref={wrapRef} className="relative flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-600 ring-1 ring-blue-500/20 transition-all duration-300 hover:-translate-y-0.5 dark:text-blue-400"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        {copied ? "링크 복사됨" : "공유하기"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white text-left shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <button
            type="button"
            onClick={shareLink}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <Link2 className="h-3.5 w-3.5 text-blue-500" aria-hidden />
            링크 공유·복사
          </button>
          <button
            type="button"
            onClick={shareToBoard}
            className="flex w-full items-center gap-2 border-t border-neutral-100 px-3 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-800"
          >
            <MessagesSquare className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            자유게시판에 공유
          </button>
        </div>
      )}
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
