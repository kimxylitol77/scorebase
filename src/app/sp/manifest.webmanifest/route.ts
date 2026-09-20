// sportspredictions.live 웹 앱 매니페스트 — 아이콘은 스코어베이스와 동일(public/icon-*.png), 이름만 자매 사이트.
import { SP_NAME } from "@/lib/sp/site";

export const dynamic = "force-static";

export function GET() {
  const body = {
    name: SP_NAME,
    short_name: "Predictions",
    start_url: "/",
    display: "standalone",
    background_color: "#060a1e",
    theme_color: "#060a1e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json; charset=utf-8" } });
}
