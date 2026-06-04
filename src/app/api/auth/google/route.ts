import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// 구글 OAuth 시작 — 동의 화면으로 redirect.
// CSRF 방지: 무작위 state + 복귀 경로(from)를 httpOnly 쿠키에 저장 → callback 에서 검증.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=oauth_unconfigured", req.url));
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from") || "/";
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const redirectUri = `${url.origin}/api/auth/google/callback`;

  const state = randomBytes(16).toString("hex");
  const c = await cookies();
  c.set("g_oauth_state", `${state}|${safeFrom}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10분
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString());
}
