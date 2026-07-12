// 클라이언트 로그인 여부 확인 — 소프트 게이트(성적표 AI 픽 블러)용 경량 엔드포인트.
// 값은 boolean 만 — 개인정보 미노출. ISR 페이지가 세션을 못 읽는 한계를 클라 fetch 로 보완.
import { NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getCurrentUserId();
  return NextResponse.json({ loggedIn: Boolean(uid) }, { headers: { "Cache-Control": "no-store" } });
}
