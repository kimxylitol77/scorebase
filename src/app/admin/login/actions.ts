"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  createSessionCookie,
  verifyCredentials,
} from "@/lib/auth";
import { rateLimit, rateLimitReset } from "@/lib/rate-limit";

export interface LoginState {
  ok: boolean;
  error?: string;
}

async function clientKey(): Promise<string> {
  const h = await headers();
  // Vercel 은 x-forwarded-for / x-real-ip 헤더로 클라 IP 전달
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = h.get("x-real-ip");
  return xff || real || "unknown";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const from = String(formData.get("from") ?? "/admin");

  if (!username || !password) {
    return { ok: false, error: "사용자명과 비밀번호를 입력해주세요." };
  }

  // brute-force 방지 — IP 별 5분 10회 → 15분 잠금
  const ip = await clientKey();
  const rl = rateLimit(`admin-login:${ip}`, {
    max: 10,
    windowMs: 5 * 60 * 1000,
    lockMs: 15 * 60 * 1000,
  });
  if (!rl.allowed) {
    const min = Math.ceil(rl.retryAfterSec / 60);
    return {
      ok: false,
      error: `로그인 시도가 너무 많습니다. ${min}분 후 다시 시도해주세요.`,
    };
  }

  if (!verifyCredentials(username, password)) {
    return {
      ok: false,
      error: `사용자명 또는 비밀번호가 올바르지 않습니다. (남은 시도 ${rl.remaining}회)`,
    };
  }

  // 성공 시 카운터 리셋
  rateLimitReset(`admin-login:${ip}`);

  const { value, maxAge } = createSessionCookie(username);
  const c = await cookies();
  c.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge,
  });

  // open redirect 방지: /admin 으로 시작하는 경로만 허용
  const safeFrom = from.startsWith("/admin") ? from : "/admin";
  redirect(safeFrom);
}
