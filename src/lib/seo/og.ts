// 범용 페이지 OG 이미지 헬퍼 — /api/og/page 라우트에 제목·부제를 넘겨 1200×630 카드 URL 생성.
//  데이터 페이지(적중률·성적표·계산기·이적·정체성 랜딩)가 og:image 를 공유하도록.
import { SITE_URL } from "@/lib/site-url";

/** metadata.openGraph.images 에 그대로 넣는 배열. title 필수, subtitle/tag 선택. */
export function ogPageImage(opts: { title: string; subtitle?: string; tag?: string }) {
  const params = new URLSearchParams({ title: opts.title });
  if (opts.subtitle) params.set("subtitle", opts.subtitle);
  if (opts.tag) params.set("tag", opts.tag);
  return [
    {
      url: `${SITE_URL}/api/og/page?${params.toString()}`,
      width: 1200,
      height: 630,
      alt: opts.title,
    },
  ];
}
