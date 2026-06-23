// GET /api/lineup/img?u=<thesports url> — 캡처용 same-origin 이미지 프록시.
// html-to-image가 thesports 사진을 직접 embed하면 CORS/hotlink로 실패 → 서버가 받아 same-origin으로 재제공.

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u");
  if (!u || !u.startsWith("https://img.thesports.com/")) {
    return new Response("bad request", { status: 400 });
  }
  try {
    const res = await fetch(u, { cache: "force-cache" });
    if (!res.ok) return new Response("not found", { status: 404 });
    const buf = await res.arrayBuffer();
    return new Response(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=604800, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response("error", { status: 500 });
  }
}
