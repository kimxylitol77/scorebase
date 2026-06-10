import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { COOKIE_NAME, readSessionCookie } from "@/lib/auth";
import ActiveUsersBadge from "@/components/admin/ActiveUsersBadge";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const c = await cookies();
  const session = readSessionCookie(c.get(COOKIE_NAME)?.value);

  // 미인증 차단 — login/logout 경로만 예외. 그 외 /admin/* 는 서명(HMAC) 무효 시 로그인으로 redirect.
  // middleware 는 Edge 라 쿠키 "존재"만 검사하므로, 실제 검증·차단은 반드시 여기(Node)에서 한다.
  const h = await headers();
  const pathname = h.get("x-pathname") || "";
  const isAuthRoute = pathname === "/admin/login" || pathname === "/admin/logout";
  if (!session && !isAuthRoute) {
    redirect("/admin/login");
  }

  // 로그인 페이지는 자기 자신이라 헤더 안 표시
  // (session 이 null 이면 헤더 없는 단순 레이아웃)
  if (!session) {
    return <div className="py-8">{children}</div>;
  }

  return (
    <div>
      <AdminBar username={session.username} />
      {children}
    </div>
  );
}

function AdminBar({ username }: { username: string }) {
  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-4 text-sm">
        <span className="text-xs font-bold tracking-[0.2em] uppercase text-neutral-500">
          ADMIN
        </span>

        <nav className="flex items-center gap-3">
          <Link
            href="/admin"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            검수
          </Link>
          <Link
            href="/admin/articles"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            글 관리
          </Link>
          <Link
            href="/admin/new"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            새 글
          </Link>
          <Link
            href="/admin/notices"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            공지/패치노트
          </Link>
          <Link
            href="/admin/blog"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            블로그
          </Link>
          <Link
            href="/admin/links"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            🔗 링크
          </Link>
          <Link
            href="/admin/stats"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            접속자 통계
          </Link>
          <Link
            href="/admin/users"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            회원 현황
          </Link>
          <Link
            href="/admin/health"
            className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition"
          >
            사이트 상태
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <ActiveUsersBadge />
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-neutral-700 dark:text-neutral-300">
              <span className="font-semibold">{username}</span>{" "}
              <span className="text-neutral-500">로그인됨</span>
            </span>
          </span>
          <a
            href="/admin/logout"
            className="text-xs px-2.5 py-1 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
          >
            로그아웃
          </a>
        </div>
      </div>
    </div>
  );
}
