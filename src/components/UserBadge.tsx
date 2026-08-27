"use client";
// 방문자 로그인 상태 배지 — 비로그인 시 "로그인" 링크, 로그인 시 닉네임 + 로그아웃.
// 서버 컴포넌트 cookies() 호출이 전 페이지를 dynamic 강등시키던 회귀(CDN MISS) 때문에
// /api/me 클라이언트 조회로 전환 — 페이지는 정적(ISR) 유지. (use-me.ts 공용 훅)

import Link from "next/link";
import { logoutUserAction } from "@/app/(auth)/actions";
import { useMe, resetMe } from "./use-me";

function LoginLink() {
  return (
    <Link
      href="/login"
      className="inline-flex items-center px-2.5 py-1 rounded-full border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-xs font-semibold text-neutral-700 dark:text-neutral-300"
    >
      로그인
    </Link>
  );
}

export default function UserBadge() {
  const me = useMe();
  // null = 아직 미확인(하드로드 직후) — "로그인"을 기본값으로 그리면 로그인 사용자가
  // 로그아웃된 화면을 먼저 본다(2026-08-22 리뷰 T2). 확인 전엔 같은 크기의 스켈레톤 필.
  if (me === null)
    return (
      <span
        aria-hidden
        className="inline-flex items-center px-2.5 py-1 rounded-full border border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-transparent select-none animate-pulse bg-neutral-100 dark:bg-neutral-900"
      >
        로그인
      </span>
    );
  if (!me.nickname) return <LoginLink />;

  return (
    <div className="inline-flex items-center gap-1.5">
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition text-xs font-semibold text-blue-700 dark:text-blue-400"
        title={`${me.nickname} — 내 정보`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="max-w-[80px] truncate">{me.nickname}</span>
      </Link>
      <form
        action={async () => {
          resetMe(); // 소프트 네비게이션에서도 배지 즉시 갱신
          await logoutUserAction();
        }}
      >
        <button
          type="submit"
          className="text-[11px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
        >
          로그아웃
        </button>
      </form>
    </div>
  );
}
