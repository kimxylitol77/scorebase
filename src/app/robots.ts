import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL;
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /go — 사람 전용 외부 이동 통로 (스코어보드 footer → scorebase). 봇 경유 차단.
        disallow: ["/admin", "/api/admin", "/go"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
