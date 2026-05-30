"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  USER_COOKIE_NAME,
  createUserSessionCookie,
  hashPassword,
  verifyPassword,
} from "@/lib/user-auth";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";
import { expToLevel } from "@/lib/user-level";

export interface AuthState {
  ok: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientKey(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = h.get("x-real-ip");
  return xff || real || "unknown";
}

async function setSession(userId: string): Promise<void> {
  const { value, maxAge } = createUserSessionCookie(userId);
  const c = await cookies();
  c.set(USER_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

/** open redirect 방지: 사이트 내부 경로(//evil 제외)만 허용 */
function safeRedirect(from: string): string {
  return from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

export async function signupUserAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();
  const from = safeRedirect(String(formData.get("from") ?? "/"));

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "올바른 이메일 형식을 입력해주세요." };
  }
  if (password.length < 8) {
    return { ok: false, error: "비밀번호는 최소 8자 이상이어야 합니다." };
  }
  if (nickname.length < 1 || nickname.length > 20) {
    return { ok: false, error: "닉네임은 1~20자로 입력해주세요." };
  }

  const ip = await clientKey();
  const rl = rateLimit(`user-signup:${ip}`, {
    max: 5,
    windowMs: 10 * 60 * 1000,
    lockMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    const min = Math.ceil(rl.retryAfterSec / 60);
    return { ok: false, error: `가입 시도가 너무 많습니다. ${min}분 후 다시 시도해주세요.` };
  }

  // 사전 중복 체크 + create 의 P2002 병행 (동시 요청 race 도 DB unique 가 방어)
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "이미 가입된 이메일입니다." };
  }

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), nickname },
      select: { id: true },
    });
    userId = user.id;
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return { ok: false, error: "이미 가입된 이메일입니다." };
    }
    return {
      ok: false,
      error: "가입 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  rateLimitReset(`user-signup:${ip}`);
  await setSession(userId);
  redirect(from);
}

export async function loginUserAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const from = safeRedirect(String(formData.get("from") ?? "/"));

  if (!email || !password) {
    return { ok: false, error: "이메일과 비밀번호를 입력해주세요." };
  }

  const ip = await clientKey();
  const rl = rateLimit(`user-login:${ip}`, {
    max: 10,
    windowMs: 5 * 60 * 1000,
    lockMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    const min = Math.ceil(rl.retryAfterSec / 60);
    return { ok: false, error: `로그인 시도가 너무 많습니다. ${min}분 후 다시 시도해주세요.` };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, exp: true, lastAttendanceAt: true },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return {
      ok: false,
      error: `이메일 또는 비밀번호가 올바르지 않습니다. (남은 시도 ${rl.remaining}회)`,
    };
  }

  rateLimitReset(`user-login:${ip}`);

  // 출석 경험치 +10 (KST 하루 1회). 실패해도 로그인은 진행.
  const KST = 9 * 3600 * 1000;
  const nk = new Date(Date.now() + KST);
  const todayStart = new Date(
    Date.UTC(nk.getUTCFullYear(), nk.getUTCMonth(), nk.getUTCDate()) - KST,
  );
  if (!user.lastAttendanceAt || user.lastAttendanceAt < todayStart) {
    const newExp = user.exp + 10;
    await prisma.user
      .update({
        where: { id: user.id },
        data: { exp: newExp, level: expToLevel(newExp), lastAttendanceAt: new Date() },
      })
      .catch(() => {});
  }

  await setSession(user.id);
  redirect(from);
}

export async function logoutUserAction(): Promise<void> {
  const c = await cookies();
  c.delete(USER_COOKIE_NAME);
  redirect("/");
}
