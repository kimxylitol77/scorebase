"use client";
// admin 로그인 중일 때만 본문 페이지에 노출되는 편집 링크. 클릭 시 /admin/review/[id] 로 이동.
// cookies() 서버 렌더가 articles/[slug] ISR 을 dynamic 강등시키던 회귀 수정 — /api/me 조회 (use-me.ts).

import Link from "next/link";
import { useMe } from "./use-me";

export default function AdminEditLink({ articleId }: { articleId: number }) {
  const me = useMe();
  if (!me?.admin) return null;
  return (
    <Link
      href={`/admin/review/${articleId}`}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/15 transition text-emerald-700 dark:text-emerald-400"
      title="관리자 — 이 글 수정"
    >
      ✏️ <span className="hidden sm:inline">편집</span>
    </Link>
  );
}
