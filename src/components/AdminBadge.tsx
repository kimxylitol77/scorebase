// admin 로그인 중일 때만 사이트 어디서든 노출되는 배지.
// 클릭 시 /admin 으로 이동.

import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";

export default async function AdminBadge() {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);
  if (!session) return null;
  return (
    <Link
      href="/admin"
      className="group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/15 transition text-xs font-semibold text-emerald-700 dark:text-emerald-400"
      title={`관리자 ${session.username} 로그인 중 — 클릭하면 관리자 페이지로`}
    >
      <span className="relative flex w-1.5 h-1.5">
        <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
        <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-500" />
      </span>
      <span className="hidden sm:inline">ADMIN</span>
      <span className="sm:hidden" aria-hidden>🛠️</span>
    </Link>
  );
}
