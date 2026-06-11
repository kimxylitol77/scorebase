// /go/scorebase — 스코어보드.kr footer → scorebase.kr 사람 전용 통로.
// robots.txt 가 /go 를 Disallow 하므로 검색 봇은 이 경유로 scorebase.kr 에 도달하지 못한다
// (footer 앵커의 rel=nofollow 와 이중 안전망). 사람 클릭은 302 로 즉시 이동.

import { NextResponse } from "next/server";

export const runtime = "edge";

export function GET() {
  return NextResponse.redirect("https://www.scorebase.kr/", {
    status: 302,
    headers: { "X-Robots-Tag": "noindex, nofollow" },
  });
}
