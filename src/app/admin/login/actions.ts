"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  createSessionCookie,
  verifyCredentials,
} from "@/lib/auth";

export interface LoginState {
  ok: boolean;
  error?: string;
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

  if (!verifyCredentials(username, password)) {
    return { ok: false, error: "사용자명 또는 비밀번호가 올바르지 않습니다." };
  }

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
