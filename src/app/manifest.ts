// PWA 매니페스트 — "홈 화면에 추가" 시 앱 아이콘·이름·시작화면 정의. Next 가 /manifest.webmanifest 로 서빙.
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "스코어베이스 · 라이브 스코어",
    short_name: "스코어베이스",
    description:
      "축구·야구·농구·하키·e스포츠 실시간 스코어와 AI 승률 예측. KBO·EPL·NBA·MLB·LCK.",
    start_url: "/scores",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ko",
    categories: ["sports", "news"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
