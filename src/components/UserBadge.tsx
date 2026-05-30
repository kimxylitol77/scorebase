// 방문자 로그인 상태 배지 — 비로그인 시 "로그인" 링크, 로그인 시 닉네임 + 로그아웃.
// AdminBadge 패턴(server component, cookies → 세션 검증) 차용.

import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { logoutUserAction } from "@/app/(auth)/actions";

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

export default async function UserBadge() {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) return <LoginLink />;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { nickname: true },
  });
  if (!user) return <LoginLink />; // 세션 있으나 유저 삭제됨

  return (
    <div className="inline-flex items-center gap-1.5">
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition text-xs font-semibold text-blue-700 dark:text-blue-400"
        title={`${user.nickname} — 내 정보`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        <span className="max-w-[80px] truncate">{user.nickname}</span>
      </Link>
      <form action={logoutUserAction}>
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
