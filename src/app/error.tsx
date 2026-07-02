"use client";
// 전역 런타임 에러 화면 — 영어 기본 500 대신 한국어 안내 + 재시도.
// 에러 발생 사실을 /api/track/error 로 보고해 운영자가 텔레그램으로 인지 (에러 모니터링 라이트).

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        message: String(error?.message ?? "").slice(0, 300),
        digest: error?.digest ?? null,
        path: window.location.pathname + window.location.search,
      });
      navigator.sendBeacon?.("/api/track/error", body) ??
        fetch("/api/track/error", { method: "POST", body, keepalive: true }).catch(() => {});
    } catch {
      // 보고 실패는 무시 — 사용자 화면이 우선
    }
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-rose-500">
          Error
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight break-keep">
          일시적인 오류가 발생했습니다
        </h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          운영자에게 자동으로 보고됐습니다. 잠시 후 다시 시도해주세요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition dark:bg-white dark:text-neutral-900"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-full border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
