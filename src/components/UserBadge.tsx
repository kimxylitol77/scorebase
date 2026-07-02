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
  // 로딩 중엔 기본(비로그인) 표시 — 방문자 대다수가 비로그인이라 스왑 빈도 최소
  if (!me?.nickname) return <LoginLink />;

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
