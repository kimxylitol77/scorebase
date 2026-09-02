// GET /api/og/feature?key=predict[&d=YYYY-MM-DD]  — scorebase 기능 소개 카드 (1080×1080).
// key 지정 시 그 기능, 없으면 d(또는 오늘) 기준 로테이션. Threads/인스타 공용.

import { ImageResponse } from "next/og";
import { THREADS_FEATURES, featureForDate } from "@/lib/threads/features";
import { kstDayWindow } from "@/lib/threads/kst";

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=21600" };

// satori 는 시스템 폰트가 없다 — 카드에 쓰는 글자만 Google Fonts subset 으로 받는다.
// vercel/og 의 자동 폰트 로딩에만 기대면 실패 시 한글이 □ 로 깨진 채 CDN 에 캐시된다
// (2026-09-02 프로덕션 실측). 명시 로딩 실패 시엔 렌더하지 않고 500 — 두부 카드 발행 방지.
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

  const font = await loadFont(`${f.hook}${f.title}${f.sub}Scorebase scorebase.kr 무료`);
  if (!font) return new Response("font load failed", { status: 503 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "70px 66px",
          background: `linear-gradient(150deg, ${g1} 0%, ${g2} 100%)`,
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단: 로고 + 라벨 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "13px", fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em" }}>
            <BarMark />
            <span>Scorebase</span>
          </div>
          <div style={{ display: "flex", fontSize: "26px" }}>{f.emoji}</div>
        </div>

        {/* 훅 — 카드의 주인공. 스레드 리서치(2026-09-02): 체크리스트 광고 카드는 스킵당한다.
            사람 말투의 큰 한 문장이 스크롤을 세운다. 체크포인트·이모지·"기능 소개" 배지 제거. */}
        <div style={{ display: "flex", flex: 1, alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: "84px", fontWeight: 900, letterSpacing: "-0.04em", lineHeight: 1.28, wordBreak: "keep-all" }}>
            {f.hook}
          </div>
        </div>

        {/* 하단 — 무엇인지 한 줄 + 도메인 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 700, opacity: 0.92 }}>
            {f.title} · {f.sub}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", fontSize: "28px", fontWeight: 800, letterSpacing: "0.02em" }}>scorebase.kr</span>
            <span style={{ display: "flex", fontSize: "22px", fontWeight: 700, opacity: 0.85, padding: "8px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.16)" }}>무료</span>
          </div>
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
