// GET /api/og/feature?key=predict[&d=YYYY-MM-DD]  — scorebase 기능 소개 카드 (1080×1080).
// key 지정 시 그 기능, 없으면 d(또는 오늘) 기준 로테이션. Threads/인스타 공용.

import { ImageResponse } from "next/og";
import { THREADS_FEATURES, featureForDate } from "@/lib/threads/features";
import { kstDayWindow } from "@/lib/threads/kst";

export const runtime = "nodejs";

const CACHE_HEADERS = { "Cache-Control": "public, max-age=3600, s-maxage=21600" };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const { dateKey } = kstDayWindow(url.searchParams.get("d"));
  const f = (key && THREADS_FEATURES.find((x) => x.key === key)) || featureForDate(dateKey);
  const [g1, g2] = f.accent;

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
          <div style={{ display: "flex", fontSize: "19px", fontWeight: 700, padding: "8px 20px", borderRadius: "999px", background: "rgba(255,255,255,0.18)" }}>
            기능 소개
          </div>
        </div>

        {/* 큰 이모지 */}
        <div style={{ display: "flex", fontSize: "138px", marginTop: "44px", lineHeight: 1 }}>{f.emoji}</div>

        {/* 타이틀 + 부제 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "14px" }}>
          <div style={{ display: "flex", fontSize: "66px", fontWeight: 900, letterSpacing: "-0.035em" }}>{f.title}</div>
          <div style={{ display: "flex", fontSize: "31px", fontWeight: 600, opacity: 0.92 }}>{f.sub}</div>
        </div>

        {/* 포인트 3개 */}
        <div style={{ display: "flex", flexDirection: "column", gap: "22px", marginTop: "50px", flex: 1 }}>
          {f.points.map((p, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <div style={{ display: "flex", width: "46px", height: "46px", borderRadius: "13px", background: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}>
                <svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" stroke="white" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              </div>
              <span style={{ display: "flex", fontSize: "33px", fontWeight: 600 }}>{p}</span>
            </div>
          ))}
        </div>

        {/* 하단 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ display: "flex", fontSize: "27px", fontWeight: 800, letterSpacing: "0.02em" }}>scorebase.kr</span>
          <span style={{ display: "flex", fontSize: "22px", fontWeight: 700, opacity: 0.85, padding: "8px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.16)" }}>매일 무료 공개</span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080, headers: CACHE_HEADERS },
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
