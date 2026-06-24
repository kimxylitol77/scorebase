// GET /api/og/avatar  — scorebase 프로필 아바타 (1080×1080, 원형 크롭 대비 중앙 집중).
// Threads/인스타 프로필 사진용. BarMark 브랜드 마크 + 워드마크.

import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400" };

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "56px",
          background: "linear-gradient(140deg, #2563eb 0%, #7c3aed 100%)",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* BarMark — 4개 막대 (헤더 로고 확대판) */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: "24px", height: "300px" }}>
          <div style={{ width: "60px", height: "120px", background: "white", opacity: 0.55, borderRadius: "16px" }} />
          <div style={{ width: "60px", height: "190px", background: "white", opacity: 0.72, borderRadius: "16px" }} />
          <div style={{ width: "60px", height: "250px", background: "white", opacity: 0.88, borderRadius: "16px" }} />
          <div style={{ width: "60px", height: "300px", background: "white", borderRadius: "16px" }} />
        </div>
        {/* 워드마크 */}
        <div
          style={{
            display: "flex",
            fontSize: "104px",
            fontWeight: 900,
            color: "white",
            letterSpacing: "-0.04em",
          }}
        >
          Scorebase
        </div>
      </div>
    ),
    { width: 1080, height: 1080, headers: CACHE_HEADERS },
  );
}
