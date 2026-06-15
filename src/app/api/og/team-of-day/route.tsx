// GET /api/og/team-of-day?date=YYYY-MM-DD — 그날 월드컵 베스트11 4-2-3-1 피치 SNS 카드.
// 1080×1350 (인스타 4:5 피드·스레드 호환). 텔레그램 SNS 배달 + 수동 게시용 public 이미지.
// 디자인 컨셉은 world-cup/team-of-day 페이지 피치 + api/og/daily 헤더/푸터와 동일.

import { ImageResponse } from "next/og";
import { getTeamOfDay, type TodPlayer, type TeamOfDay } from "@/lib/sports/thesports/team-of-day";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
};

const fmtDateKo = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};

/** 외부 이미지를 base64 data URI 로 변환 — satori 가 외부 URL 을 직접 못 가져오는 경우 회피. */
async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/png";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;

  let tod: TeamOfDay | null = null;
  try {
    tod = await getTeamOfDay(date);
  } catch (e) {
    console.warn("[og/team-of-day] getTeamOfDay fail:", (e as Error).message);
  }

  if (!tod || tod.xi.length === 0) {
    return new ImageResponse(<Fallback />, {
      width: 1080,
      height: 1350,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  // satori 가 외부 이미지 URL 을 직접 못 가져오는 경우가 있어 미리 data URI 로 임베드.
  const xi = await Promise.all(
    tod.xi.map(async (p) => ({ ...p, logo: await toDataUri(p.logo) })),
  );

  return new ImageResponse(
    <Card dk={fmtDateKo(tod.date)} matches={tod.matches} xi={xi} />,
    { width: 1080, height: 1350, headers: CACHE_HEADERS },
  );
}

function Card({
  dk,
  matches,
  xi,
}: {
  dk: string;
  matches: TeamOfDay["matches"];
  xi: TodPlayer[];
}) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "52px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        color: "white",
        fontFamily: "Pretendard, system-ui, sans-serif",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "32px", fontWeight: 900, letterSpacing: "-0.02em" }}>
          <BarMark />
          <span>Scorebase</span>
        </div>
        <div style={{ display: "flex", fontSize: "22px", fontWeight: 700, padding: "6px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.14)" }}>
          {dk}
        </div>
      </div>

      {/* 타이틀 */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: "20px" }}>
        <span style={{ fontSize: "52px", fontWeight: 900, letterSpacing: "-0.03em" }}>오늘의 베스트 11</span>
        <span style={{ display: "flex", fontSize: "23px", opacity: 0.7, marginTop: "2px" }}>2026 월드컵 · {dk} · 경기 평점 TOP 11</span>
      </div>

      {/* 경기 결과 칩 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "14px" }}>
        {matches.map((m, i) => (
          <div key={i} style={{ display: "flex", fontSize: "18px", fontWeight: 600, padding: "5px 13px", borderRadius: "10px", background: "rgba(255,255,255,0.08)" }}>
            {m.homeKo}
            <span style={{ fontWeight: 900, margin: "0 6px" }}>{m.homeScore ?? "-"}:{m.awayScore ?? "-"}</span>
            {m.awayKo}
          </div>
        ))}
      </div>

      {/* 피치 */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flex: 1,
          marginTop: "18px",
          borderRadius: "24px",
          background: "linear-gradient(to bottom, #0f5132 0%, #0a3d27 100%)",
          border: "2px solid rgba(16,185,129,0.4)",
          overflow: "hidden",
        }}
      >
        {/* 라인 */}
        <div style={{ position: "absolute", left: "18px", right: "18px", top: "18px", bottom: "18px", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "6px" }} />
        <div style={{ position: "absolute", left: "18px", right: "18px", top: "50%", borderTop: "2px solid rgba(255,255,255,0.12)" }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: "150px", height: "150px", transform: "translate(-50%, -50%)", border: "2px solid rgba(255,255,255,0.12)", borderRadius: "999px" }} />
        {/* 선수 */}
        {xi.map((p, i) => (
          <Player key={i} p={p} />
        ))}
      </div>

      {/* 하단 */}
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", fontSize: "20px", opacity: 0.7, letterSpacing: "0.05em", marginTop: "12px" }}>
        scorebase.kr
      </div>
    </div>
  );
}

function Player({ p }: { p: TodPlayer }) {
  return (
    <div
      style={{
        position: "absolute",
        left: `${p.x}%`,
        top: `${p.y}%`,
        transform: "translate(-50%, -50%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: "160px",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "86px",
          height: "86px",
          borderRadius: "18px",
          background: "#1f2937",
          border: "3px solid rgba(255,255,255,0.85)",
          alignItems: "center",
          justifyContent: "center",
          ...(p.logo
            ? { backgroundImage: `url(${p.logo})`, backgroundSize: "cover", backgroundPosition: "center top" }
            : {}),
        }}
      >
        {!p.logo && (
          <span style={{ fontSize: "32px", fontWeight: 900, color: "#d1d5db" }}>{p.name.slice(0, 1)}</span>
        )}
        {p.goals > 0 && (
          <div style={{ position: "absolute", top: "-4px", right: "-4px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: "26px", height: "26px", padding: "0 5px", borderRadius: "999px", background: "#fbbf24", color: "#111827", fontSize: "16px", fontWeight: 900, border: "2px solid white" }}>
            {p.goals > 1 ? `⚽${p.goals}` : "⚽"}
          </div>
        )}
      </div>
      <div style={{ display: "flex", marginTop: "6px", fontSize: "21px", fontWeight: 800, color: "white", textShadow: "0 1px 3px rgba(0,0,0,0.9)", textAlign: "center" }}>
        {p.name}{p.captain ? " ©" : ""}
      </div>
      <div style={{ display: "flex", marginTop: "4px", fontSize: "17px", fontWeight: 800, color: "#6ee7b7", background: "rgba(16,185,129,0.2)", padding: "2px 10px", borderRadius: "6px" }}>
        평점 {p.rating.toFixed(1)}
      </div>
    </div>
  );
}

function BarMark() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "36px" }}>
      <div style={{ width: "7px", height: "14px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "22px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "30px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "36px", background: "white", borderRadius: "2px" }} />
    </div>
  );
}

function Fallback() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0f5132 0%, #0a3d27 100%)",
        color: "white",
        fontSize: "60px",
        fontWeight: 900,
      }}
    >
      Scorebase 베스트 11
    </div>
  );
}
