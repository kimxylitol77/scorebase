// PWA 매니페스트 — "홈 화면에 추가" 시 앱 아이콘·이름·시작화면 정의. Next 가 /manifest.webmanifest 로 서빙.
import type { MetadataRoute } from "next";

// handle_links/launch_handler 는 MetadataRoute.Manifest 타입에 아직 없음 — 표준 제안 필드라 직접 확장.
// handle_links "not-preferred" = 브라우저에서 사이트 링크를 누를 때 설치된 앱으로 가로채지 말라는 힌트
// (크롬이 지원하는 환경에서 "브라우저는 브라우저대로, 앱은 앱대로" 분리 유지).
type ManifestExt = MetadataRoute.Manifest & {
  handle_links?: "auto" | "preferred" | "not-preferred";
  launch_handler?: { client_mode: string };
};

export default function manifest(): ManifestExt {
  return {
    handle_links: "not-preferred",
    // 앱 아이콘으로 열 때 이미 떠 있는 앱 창 재사용 (새 창 난립 방지)
    launch_handler: { client_mode: "navigate-existing" },
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
