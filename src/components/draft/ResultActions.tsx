"use client";
// 드래프트 결과 화면의 동작 버튼 — 공유(Web Share·클립보드), 순위 등록(회원), 로그인 유도(비회원)
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";

interface Props {
  gameId: string;
  url: string;
  text: string;
  /** mine = 이 브라우저가 플레이한 판 */
  mine: boolean;
  registered: boolean;
  loggedIn: boolean;
}

export default function ResultActions({ gameId, url, text, mine, registered, loggedIn }: Props) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "농구 블라인드 드래프트", text, url });
      } catch {
        // 공유 시트를 닫음 — 무시
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 클립보드 권한 거부 — 무시
    }
  }

  async function claim() {
    setBusy(true);
    await fetch("/api/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "claim", gameId }) });
    router.refresh();
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-4 py-3.5 text-sm font-semibold text-amber-950 transition-all duration-300 hover:-translate-y-0.5 hover:bg-amber-300"
      >
        <Share2 className="h-4 w-4" aria-hidden />
        {copied ? "링크를 복사했습니다" : mine ? "결과 자랑하기" : "이 결과 공유"}
      </button>
      {mine && !registered && loggedIn && (
        <button
          type="button"
          disabled={busy}
          onClick={claim}
          className="w-full rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
        >
          순위에 등록하기
        </button>
      )}
      {mine && !registered && !loggedIn && (
        <Link
          href={`/login?from=/basketball/draft/result/${gameId}`}
          className="block w-full rounded-2xl bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-900 ring-1 ring-black/10 transition hover:ring-rose-500/50 dark:bg-white/[0.06] dark:text-white dark:ring-white/10"
        >
          로그인하고 순위에 등록
        </Link>
      )}
    </div>
  );
}
