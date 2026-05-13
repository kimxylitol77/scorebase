import type { NextConfig } from "next";

const securityHeaders = [
  // HTTPS 강제 — 1년 + preload list 등록 가능
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // 클릭재킹 방지 — iframe 임베드 거부
  { key: "X-Frame-Options", value: "DENY" },
  // MIME 스니핑 방지
  { key: "X-Content-Type-Options", value: "nosniff" },
  // referrer 정보 최소화 (cross-origin 시 origin 만)
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // 브라우저 기능 권한 — 카메라/마이크/위치 등 모두 거부
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // XSS protection (구형 브라우저용)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // DNS prefetch 허용 (성능)
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // 외부 hotlink 차단되는 CDN 만 Next.js image optimizer 로 우회 (서버가 fetch
  // 후 재제공 → 클라이언트 Referer 검사 회피). 다른 리그 (EPL/NBA/MLB/NPB/KBO)
  // CDN 은 hotlink 허용해서 plain <img> 그대로 사용.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "liquipedia.net" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
