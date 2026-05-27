"use client";

// /predictions 인덱스의 error boundary.
// PredictionsRoot / PredictionsView render throw 시 500 페이지 대신 graceful fallback.
// 2026-05-27 /predictions 500 일관 fail (local 정상, production 만) — Next.js error boundary
// 로 일단 페이지 살리고 진짜 원인은 error.message 로 향후 진단.

import Link from "next/link";
import { useEffect } from "react";

export default function PredictionsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[predictions] render error:", error.message, error.digest);
  }, [error]);

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center space-y-4">
      <h1 className="text-2xl sm:text-3xl font-black">시즌 예측</h1>
      <p className="text-sm text-neutral-500">
        예측 페이지를 일시적으로 불러올 수 없습니다. 잠시 후 다시 시도해주세요.
      </p>
      {error.digest && (
        <p className="text-xs text-neutral-400 font-mono">디버그: {error.digest}</p>
      )}
      <div className="flex items-center justify-center gap-3 pt-4">
        <button
          onClick={() => reset()}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700"
        >
          다시 시도
        </button>
        <Link
          href="/scores"
          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 text-sm font-semibold hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          라이브 스코어로
        </Link>
      </div>
    </main>
  );
}
