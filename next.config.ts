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
