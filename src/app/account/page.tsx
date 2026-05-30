// 회원 개인 페이지(마이페이지) — 본인 정보 + 등급 미리보기 + 로그아웃.
// user_session 인증(미로그인 → /login). exp 컬럼은 2단계라 현재 0 기준 미리보기.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { logoutUserAction } from "@/app/(auth)/actions";
import { gradeByExp, levelProgress } from "@/lib/user-level";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 정보 · 스코어베이스",
  robots: { index: false, follow: false },
};

function fmtKst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}.${p(k.getUTCMonth() + 1)}.${p(k.getUTCDate())}`;
}

export default async function AccountPage() {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) redirect("/login?from=/account");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, nickname: true, createdAt: true },
  });
  if (!user) redirect("/login?from=/account");

  // 등급: exp 컬럼은 2단계(프로필 UI) 때 도입 → 현재 0 기준 미리보기.
  const exp = 0;
  const grade = gradeByExp(exp);
  const prog = levelProgress(exp);

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-xl font-black tracking-tight mb-6">내 정보</h1>

      {/* 등급 카드 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-gradient-to-br from-blue-500/5 to-transparent p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="text-3xl leading-none">{grade.emoji}</div>
          <div className="min-w-0">
            <div className="text-xs text-neutral-500">
              Lv.{grade.level} · {grade.name}
            </div>
            <div className="text-lg font-black truncate">{user.nickname}</div>
          </div>
        </div>
        {prog.next && (
          <div className="mt-4">
            <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.round(prog.ratio * 100)}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-neutral-500">
              다음 등급{" "}
              <span className="font-semibold">
                {prog.next.emoji} {prog.next.name}
              </span>{" "}
              — 등급 시스템 곧 오픈 (활동·예측 적중으로 승급)
            </div>
          </div>
        )}
      </div>

      {/* 계정 정보 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-900 mb-5">
        <Row label="닉네임" value={user.nickname} />
        <Row label="이메일" value={user.email} />
        <Row label="가입일" value={fmtKst(user.createdAt)} />
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
        >
          ← 홈으로
        </Link>
        <form action={logoutUserAction}>
          <button
            type="submit"
            className="text-sm px-4 py-2 rounded-md bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition"
          >
            로그아웃
          </button>
        </form>
      </div>

      <p className="mt-8 text-[11px] text-neutral-400 text-center">
        비밀번호 변경 · 즐겨찾기 동기화는 준비 중입니다.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <span className="text-sm text-neutral-500 shrink-0">{label}</span>
      <span className="text-sm font-semibold truncate">{value}</span>
    </div>
  );
}
