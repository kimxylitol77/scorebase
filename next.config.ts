import type { NextConfig } from "next";

// 개발(next dev)은 Turbopack HMR/React Refresh 가 eval 을 써서 'unsafe-eval' 가 필요하다.
// 프로덕션 빌드는 eval 을 쓰지 않으므로 빼서 정책을 더 좁게 유지한다.
const isDev = process.env.NODE_ENV !== "production";

// Content-Security-Policy — 외부 스크립트 주입·폼 탈취·object/embed·MIME 우회 공격 표면 축소.
//   · frame-ancestors 는 의도적으로 제외: 클릭재킹은 middleware 의 host별 X-Frame-Options 가
//     담당하고(스코어보드.kr 은 iframe 위젯 임베드 허용 필요), 전역 frame-ancestors 'none' 은
//     그 임베드를 깨뜨린다.
//   · script/style 'unsafe-inline' 유지 — GTM/GA4(gtag) inline 부트스트랩 + 전 페이지 JSON-LD
//     inline 스크립트 때문. inline-script XSS 는 막지 못하나(차선) 외부 스크립트 주입은 차단.
//   · 허용 origin 은 실제 클라이언트 로드 기준: jsdelivr(Pretendard 폰트·국기 woff2),
//     googletagmanager/google-analytics(GTM·GA4), va.vercel-scripts(Vercel Analytics),
//     youtube(-nocookie)/vimeo(하이라이트·블로그 영상 임베드). img 는 https 전역 허용(이미지 CDN 다수).
const cspValue = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "connect-src 'self' https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://va.vercel-scripts.com",
  "frame-src 'self' https://www.googletagmanager.com https://www.youtube-nocookie.com https://www.youtube.com https://youtube.com https://player.vimeo.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // HTTPS 강제 — 1년 + preload list 등록 가능
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // 클릭재킹 방지(X-Frame-Options)는 middleware 에서 host별 처리:
  //   scorebase.kr = DENY, 스코어보드.kr = 미설정(iframe 위젯 임베드 허용).
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
  // Content-Security-Policy (정책 본문·근거는 위 cspValue 정의 참조)
  { key: "Content-Security-Policy", value: cspValue },
  // XSS protection (구형 브라우저용)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // DNS prefetch 허용 (성능)
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // X-Powered-By: Next.js 헤더 제거 — 스택 노출(공격 표면 힌트) 차단
  poweredByHeader: false,
  // 외부 hotlink 차단되는 CDN 만 Next.js image optimizer 로 우회 (서버가 fetch
  // 후 재제공 → 클라이언트 Referer 검사 회피). 다른 리그 (EPL/NBA/MLB/NPB/KBO)
  // CDN 은 hotlink 허용해서 plain <img> 그대로 사용.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "liquipedia.net" },
      // 시즌 리더보드 선수 사진 source
      { protocol: "https", hostname: "media.api-sports.io" }, // 축구 (API-Football)
      { protocol: "https", hostname: "assets.nhle.com" }, // NHL 공식
      { protocol: "https", hostname: "img.mlbstatic.com" }, // MLB Stats API
      { protocol: "https", hostname: "p.npb.jp" }, // NPB 공식
      { protocol: "https", hostname: "cdn.nba.com" }, // NBA (BDL id 매칭 불가 — placeholder만)
      { protocol: "https", hostname: "a.espncdn.com" }, // NBA headshot (ESPN roster fetch 후 매핑)
      { protocol: "https", hostname: "6ptotvmi5753.edge.naverncp.com" }, // KBO 공식 (네이버 클라우드 edge)
      { protocol: "https", hostname: "**.thesports.com" }, // TheSports (LOL 팀/챔프/아이템/선수 로고 eimg.thesports.com)
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
  // apex (scorebase.kr) → www (www.scorebase.kr) 강제 영구 redirect.
  // Vercel 의 자동 redirect 는 307 (임시) 라 SEO 색인 권한 이전이 약함.
  // 여기서 명시적 permanent: true → 308 응답 (HTTP/1.1 308 ≈ 301, Google 영구로 처리).
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "scorebase.kr" }],
        destination: "https://www.scorebase.kr/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
