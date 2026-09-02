// GET /api/og/feature?key=predict[&d=YYYY-MM-DD]  — scorebase 기능 소개 카드 (1080×1080).
// key 지정 시 그 기능, 없으면 d(또는 오늘) 기준 로테이션. Threads/인스타 공용.
//
// v3 (2026-09-02): 실제 사이트 스크린샷을 브라우저 목업에 넣은 카드로 개편(사용자 지시).
//   추상 광고 카드보다 실물 화면이 신뢰를 만든다. 스크린샷은 public/threads/shot-{key}.png
//   (헤드리스 크롬 1920 캡처 → 968 리사이즈, 커밋 자산). UI 크게 바뀌면 재캡처할 것.

import { ImageResponse } from "next/og";
import { THREADS_FEATURES, featureForDate } from "@/lib/threads/features";
import { kstDayWindow } from "@/lib/threads/kst";
import { SITE_URL } from "@/lib/site-url";

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=21600" };

// satori 는 시스템 폰트가 없다 — 카드에 쓰는 글자만 Google Fonts subset 으로 받는다.
// vercel/og 의 자동 폰트 로딩에만 기대면 실패 시 한글이 □ 로 깨진 채 CDN 에 캐시된다
// (2026-09-02 프로덕션 실측). 명시 로딩 실패 시엔 렌더하지 않고 503 — 두부 카드 발행 방지.
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const api = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@800&text=${encodeURIComponent(text)}`;
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
  const key = url.searchParams.get("key");
  const { dateKey } = kstDayWindow(url.searchParams.get("d"));
  const f = (key && THREADS_FEATURES.find((x) => x.key === key)) || featureForDate(dateKey);
  const [g1, g2] = f.accent;

  const font = await loadFont(`${f.hook}${f.title}${f.sub}Scorebase scorebase.kr 무료 실제 화면`);
  if (!font) return new Response("font load failed", { status: 503 });

  // 스크린샷은 요청한 배포 자신의 정적 자산 — dev 에선 localhost, 프로덕션에선 SITE_URL.
  const origin = url.origin.includes("localhost") ? url.origin : SITE_URL;
  const shot = `${origin}/threads/shot-${f.key}.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "52px 56px 44px",
          background: `linear-gradient(150deg, ${g1} 0%, ${g2} 100%)`,
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단: 로고 + 이모지 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "13px", fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em" }}>
            <BarMark />
            <span>Scorebase</span>
          </div>
          <div style={{ display: "flex", fontSize: "26px" }}>{f.emoji}</div>
        </div>

        {/* 훅 — 짧고 크게 */}
        <div style={{ display: "flex", fontSize: "52px", fontWeight: 900, letterSpacing: "-0.035em", lineHeight: 1.3, wordBreak: "keep-all", marginTop: "34px" }}>
          {f.hook}
        </div>

        {/* 브라우저 목업 + 실제 스크린샷 */}
        <div
          style={{
            display: "flex", flexDirection: "column", flex: 1, marginTop: "34px",
            borderRadius: "22px", overflow: "hidden",
            boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.22)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 20px", background: "#111827" }}>
            <div style={{ display: "flex", width: "13px", height: "13px", borderRadius: "50%", background: "#f87171" }} />
            <div style={{ display: "flex", width: "13px", height: "13px", borderRadius: "50%", background: "#fbbf24" }} />
            <div style={{ display: "flex", width: "13px", height: "13px", borderRadius: "50%", background: "#34d399" }} />
            <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
              <div style={{ display: "flex", fontSize: "20px", fontWeight: 700, color: "#9ca3af", background: "#1f2937", padding: "6px 26px", borderRadius: "999px" }}>
                scorebase.kr{f.path === "/" ? "" : f.path}
              </div>
            </div>
            <div style={{ display: "flex", width: "39px" }} />
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot} alt="" width={968} style={{ width: "100%", objectFit: "cover", objectPosition: "top" }} />
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "30px" }}>
          <span style={{ display: "flex", fontSize: "27px", fontWeight: 800 }}>{f.title} — 실제 화면입니다</span>
          <span style={{ display: "flex", fontSize: "22px", fontWeight: 700, opacity: 0.9, padding: "8px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.16)" }}>무료</span>
        </div>
      </div>
    ),
    {
      width: 1080, height: 1080, headers: CACHE_HEADERS,
      fonts: [{ name: "Pretendard", data: font, weight: 800 as const, style: "normal" as const }],
    },
  );
}

function BarMark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "32px" }}>
      <div style={{ width: "7px", height: "12px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "20px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "26px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "32px", background: "white", borderRadius: "2px" }} />
    </div>
  );
}
