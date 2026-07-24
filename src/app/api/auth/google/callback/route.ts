import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { USER_COOKIE_NAME, createUserSessionCookie } from "@/lib/user-auth";
import { awardAttendance } from "@/lib/user-exp";

export const dynamic = "force-dynamic";

interface GoogleProfile {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

function fail(origin: string, code: string) {
  return NextResponse.redirect(new URL(`/login?error=${code}`, origin));
}

// 구글 콜백 — code→token→profile 교환 후 User 를 찾거나 만들고 세션 쿠키 발급.
// 계정 매칭: googleId 우선 → 같은 email 기존 계정에 googleId 연결 → 둘 다 없으면 신규 가입.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const c = await cookies();
  const stateCookie = c.get("g_oauth_state")?.value;
  c.delete("g_oauth_state");

  // CSRF: state 쿠키와 일치해야 진행
  if (!code || !state || !stateCookie) return fail(origin, "oauth");
  const [savedState, from] = stateCookie.split("|");
  if (state !== savedState) return fail(origin, "state");

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(origin, "oauth_unconfigured");

  // 이하 fetch/json/prisma 예외가 로그인 도중 raw 500 으로 노출되지 않게 전체 가드
  // (네트워크 장애·구글 응답 이상·동시 콜백 unique 경합 — 2026-07-02 감사 C3)
  try {
    // 1) authorization code → access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail(origin, "token");
    const tokens = (await tokenRes.json()) as { access_token?: string };
    if (!tokens.access_token) return fail(origin, "token");

    // 2) access token → 프로필 (sub=고유 id, email, name)
    const profRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!profRes.ok) return fail(origin, "userinfo");
    const p = (await profRes.json()) as GoogleProfile;
    const googleId = p.sub;
    const email = (p.email ?? "").toLowerCase();
    if (!googleId || !email) return fail(origin, "profile");

    // 3) User 찾기/생성
    let userId: string;
    let isNew = false;
    const byGoogle = await prisma.user.findUnique({ where: { googleId }, select: { id: true } });
    if (byGoogle) {
      userId = byGoogle.id;
    } else {
      const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (byEmail) {
        // 같은 이메일로 이미 가입 → 구글 계정 연결 + 구글이 인증한 메일이면 emailVerified 반영
        await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId, ...(p.email_verified ? { emailVerified: new Date() } : {}) },
        });
        userId = byEmail.id;
      } else {
        // 신규 — 닉네임은 구글 이름 또는 이메일 앞부분 (중복 허용, 1~20자)
        const baseNick = (p.name || email.split("@")[0] || "user").trim().slice(0, 20) || "user";
        try {
          const created = await prisma.user.create({
            // passwordHash 생략(null)=OAuth 전용. 구글이 인증한 메일이면 emailVerified 자동 기록.
            data: {
              email,
              googleId,
              nickname: baseNick,
              emailVerified: p.email_verified ? new Date() : null,
            },
            select: { id: true },
          });
          userId = created.id;
          isNew = true;
        } catch (e) {
          // 동시 콜백(더블클릭 등) unique 경합 — 다른 요청이 먼저 만든 계정 재조회로 복구
          const retry =
            (await prisma.user.findUnique({ where: { googleId }, select: { id: true } })) ??
            (await prisma.user.findUnique({ where: { email }, select: { id: true } }));
          if (!retry) throw e;
          userId = retry.id;
        }
      }
    }

    // 출석 보상 (KST 하루 1회). 이메일 로그인과 동일. 실패해도 로그인은 진행.
    await awardAttendance(userId).catch(() => {});

    // 4) 세션 쿠키 (이메일 로그인과 동일한 user_session)
    const { value, maxAge } = createUserSessionCookie(userId);
    c.set(USER_COOKIE_NAME, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge,
    });

    // 신규 구글 가입은 닉네임 설정을 유도 → /account?welcome=1 (기존 유저·계정연결은 원래 경로)
    const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";
    const dest = isNew ? "/account?welcome=1" : safeFrom;
    return NextResponse.redirect(new URL(dest, origin));
  } catch (e) {
    console.error("[oauth/google] 콜백 처리 실패:", (e as Error).message);
    return fail(origin, "server");
  }
}
