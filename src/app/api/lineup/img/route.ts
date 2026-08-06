// GET /api/lineup/img?u=<thesports url> — 캡처용 same-origin 이미지 프록시.
// html-to-image가 thesports 사진을 직접 embed하면 CORS/hotlink로 실패 → 서버가 받아 same-origin으로 재제공.

export const runtime = "nodejs";

import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  // 미들웨어 rate limit 면제 경로라 자체 제한 — 라인업 보드 1회 로드가 11~22장이므로 넉넉히.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`lineup-img:${ip}`, { max: 120, windowMs: 60_000, lockMs: 60_000 }).allowed) {
    return new Response("too many requests", { status: 429 });
  }
  const u = new URL(req.url).searchParams.get("u");
  // 허용 도메인 — 전술판 후보 풀의 사진 소스만(오픈 프록시 방지: 정확한 프리픽스).
  // thesports = 축구 / espncdn = NBA / mlbstatic = MLB. 종목 확장 때 소스를 늘리면 여기도 함께.
  const ALLOWED = [
    "https://img.thesports.com/",
    "https://a.espncdn.com/i/headshots/",
    "https://midfield.mlbstatic.com/v1/people/",
  ];
  if (!u || !ALLOWED.some((p) => u.startsWith(p))) {
    return new Response("bad request", { status: 400 });
  }
  try {
    const res = await fetch(u, { cache: "force-cache" });
    if (!res.ok) return new Response("not found", { status: 404 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        // 캡처(html-to-image)는 same-origin fetch 라 CORS 헤더 불필요 — "*" 는 타 사이트 hotlink 경유만 허용해 제거.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new Response("error", { status: 500 });
  }
}
