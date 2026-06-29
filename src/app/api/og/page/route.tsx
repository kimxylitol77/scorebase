// GET /api/og/page?title=...[&subtitle=...][&tag=...]  — 범용 페이지 OG 카드 (1200×630).
//  feature/daily 가 SNS·기능 카드 전용이라 페이지 og:image 로 재사용 불가 → 데이터 페이지
//  (적중률·성적표·계산기·이적·정체성 랜딩)가 공유하는 브랜드 OG 라우트. 제목만 넘기면 됨.

import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=86400, s-maxage=604800" };

// satori 는 시스템 폰트가 없다 → 카드에 쓰는 글자만 Google Fonts 에서 subset 해 버퍼로 받는다.
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(api)).text();
    const url = css.match(/src:\s*url\(([^)]+?)\)\s*format/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get("title") || "Scorebase").slice(0, 60);
  const subtitle = (url.searchParams.get("subtitle") || "").slice(0, 90);
  const tag = (url.searchParams.get("tag") || "").slice(0, 20);

  const fontText = title + subtitle + tag + "Scorebase scorebase.kr 0123456789·";
  const font = await loadFont(fontText);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 66px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "Noto Sans KR, system-ui, sans-serif",
        }}
      >
        {/* 상단: 로고 + 태그 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "30px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            <BarMark />
            <span>Scorebase</span>
          </div>
          {tag ? (
            <div
              style={{
                display: "flex",
                fontSize: "21px",
                fontWeight: 700,
                padding: "8px 20px",
                borderRadius: "999px",
                background: "rgba(244,63,94,0.18)",
                color: "#fda4af",
              }}
            >
              {tag}
            </div>
          ) : null}
        </div>

        {/* 가운데: 타이틀 + 부제 */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: title.length > 22 ? "58px" : "70px", fontWeight: 700, letterSpacing: "-0.035em", lineHeight: 1.15 }}>
            {title}
          </div>
          {subtitle ? (
            <div style={{ display: "flex", fontSize: "29px", fontWeight: 700, opacity: 0.66, marginTop: "22px", lineHeight: 1.4 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* 하단: 도메인 + 액센트 바 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <span style={{ display: "flex", fontSize: "24px", fontWeight: 700, letterSpacing: "0.04em", opacity: 0.8 }}>scorebase.kr</span>
          <div style={{ display: "flex", height: "6px", width: "120px", borderRadius: "999px", background: "linear-gradient(90deg, #f43f5e 0%, #fb7185 100%)" }} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: CACHE_HEADERS,
      fonts: font ? [{ name: "Noto Sans KR", data: font, weight: 700, style: "normal" }] : undefined,
    },
  );
}

function BarMark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "34px" }}>
      <div style={{ width: "7px", height: "13px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "21px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "28px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "34px", background: "white", borderRadius: "2px" }} />
    </div>
  );
}
