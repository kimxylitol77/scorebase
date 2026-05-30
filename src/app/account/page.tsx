// 회원 개인 페이지(마이페이지) — 아바타 + 경험치/등급 + 등급표 + 계정 + 로그아웃.
// user_session 인증. 경험치(exp)/등급(level)은 게시판이 추가한 User 컬럼 사용.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { logoutUserAction } from "@/app/(auth)/actions";
import { GRADES, gradeByExp, levelProgress } from "@/lib/user-level";
import { avatarById } from "@/lib/avatars";
import AvatarPicker from "./AvatarPicker";

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
    select: {
      email: true,
      nickname: true,
      createdAt: true,
      exp: true,
      level: true,
      points: true,
      avatarUrl: true,
    },
  });
  if (!user) redirect("/login?from=/account");

  const avatar = avatarById(user.avatarUrl);
  const grade = gradeByExp(user.exp);
  const prog = levelProgress(user.exp);

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-xl font-black tracking-tight mb-6">내 정보</h1>

      {/* 프로필 카드 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 mb-5">
        <div className="flex items-center gap-4">
          <div
            className={`w-16 h-16 rounded-full ${avatar.bg} flex items-center justify-center text-3xl shrink-0`}
          >
            {avatar.emoji}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black truncate">{user.nickname}</div>
            <div className="text-sm text-neutral-500">
              {grade.emoji} Lv.{grade.level} · {grade.name}
            </div>
          </div>
        </div>

        {/* 경험치 바 */}
        <div className="mt-4">
          <div className="flex justify-between text-[11px] text-neutral-500 mb-1">
            <span>경험치 {user.exp.toLocaleString()}</span>
            {prog.next ? (
              <span>
                다음 {prog.next.emoji} {prog.next.name} 까지{" "}
                {(prog.next.minExp - user.exp).toLocaleString()}
              </span>
            ) : (
              <span>최고 등급 달성 👑</span>
            )}
          </div>
          <div className="h-2 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${Math.round(prog.ratio * 100)}%` }}
            />
          </div>
          <div className="mt-2 text-[11px] text-neutral-500">
            보유 포인트{" "}
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">
              {user.points.toLocaleString()}P
            </span>
          </div>
        </div>
      </div>

      {/* 아바타 선택 */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5 mb-5">
        <div className="text-sm font-semibold mb-3">아바타 선택</div>
        <AvatarPicker current={avatar.id} />
      </section>

      {/* 등급표 */}
      <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-sm font-semibold">
          등급표 <span className="text-neutral-500 font-normal">(축구 디비전 12단계)</span>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
          {GRADES.map((g) => {
            const cur = g.level === grade.level;
            return (
              <div
                key={g.level}
                className={`flex items-center gap-3 px-4 py-2 ${cur ? "bg-blue-500/10" : ""}`}
              >
                <span className="text-lg w-6 text-center">{g.emoji}</span>
                <span
                  className={`text-sm flex-1 ${cur ? "font-bold text-blue-700 dark:text-blue-400" : ""}`}
                >
                  Lv.{g.level} {g.name}
                  {cur && " ← 현재"}
                </span>
                <span className="text-[11px] text-neutral-400 tabular-nums">
                  {g.minExp.toLocaleString()}+
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* 계정 정보 */}
      <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-900 mb-5">
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

      <p className="mt-6 text-[11px] text-neutral-400 text-center">
        출석(로그인) 시 매일 경험치가 적립됩니다. 게시판 글·예측 적중으로 더 빠르게 승급!
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
