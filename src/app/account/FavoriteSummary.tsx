"use client";

import Link from "next/link";
import { useFavorites } from "@/components/scores/useFavorites";

export default function FavoriteSummary() {
  const { ids, mounted } = useFavorites();
  const count = mounted ? ids.size : 0;

  return (
    <section className="rounded-3xl border border-neutral-200/80 dark:border-neutral-800/80 bg-white dark:bg-neutral-900/40 p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">⭐ 즐겨찾기 경기</h2>
        <Link
          href="/scores"
          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          스코어로 →
        </Link>
      </div>
      {count > 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          관심 경기{" "}
          <span className="font-bold text-neutral-900 dark:text-white">{count}</span>
          개를 즐겨찾기 중입니다.{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline">
            스코어에서 ⭐ 경기 보기
          </Link>
        </p>
      ) : (
        <p className="text-sm text-neutral-500 leading-relaxed">
          아직 즐겨찾기한 경기가 없습니다.{" "}
          <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline">
            스코어
          </Link>
          에서 경기의 ⭐를 눌러 추가해 보세요.
        </p>
      )}
    </section>
  );
}
