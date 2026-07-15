// GET /api/og/team-of-day-mvp?date=YYYY-MM-DD — 그날 베스트11 중 최고 평점 선수의 PFA 풍 MVP 카드.
// 800×1000(4:5). AI 생성 스타디움 배경(public/mvp-bg.png) + 실제 선수 얼굴(TheSports) 합성. SNS 게시용 public 이미지.
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import { getTeamOfDay } from "@/lib/sports/thesports/team-of-day";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
};
const POS_KO: Record<string, string> = { G: "골키퍼", D: "수비수", M: "미드필더", F: "공격수" };

const fmtDateKo = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};

/** 외부 이미지를 base64 data URI 로 — satori 가 외부 URL 을 직접 못 가져오는 경우 회피. */
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
  const date = new URL(req.url).searchParams.get("date") ?? undefined;

  let tod = null;
  try {
    tod = await getTeamOfDay(date);
  } catch (e) {
    console.warn("[og/team-of-day-mvp] fail:", (e as Error).message);
  }
  if (!tod || tod.xi.length === 0) {
    return new ImageResponse(<Fallback />, { width: 800, height: 1000, headers: { "Cache-Control": "public, max-age=60" } });
  }

  const mvp = [...tod.xi].sort((a, b) => b.rating - a.rating)[0];
  const [bgBuf, face] = await Promise.all([
    readFile(join(process.cwd(), "public/mvp-bg.png")).catch(() => null),
    toDataUri(mvp.logo),
  ]);
  const bg = bgBuf ? `data:image/png;base64,${bgBuf.toString("base64")}` : null;

  const bits = [mvp.countryKo, POS_KO[mvp.pos] || ""];
  if (mvp.goals > 0) bits.push(`${mvp.goals}골`);
  if (mvp.assists > 0) bits.push(`${mvp.assists}도움`);
  const sub = bits.filter(Boolean).join(" · ");

  return new ImageResponse(
    <Card dk={fmtDateKo(tod.date)} name={mvp.name + (mvp.captain ? " Ⓒ" : "")} sub={sub} rating={mvp.rating} bg={bg} face={face} />,
    { width: 800, height: 1000, headers: CACHE_HEADERS },
  );
}

function Card({ dk, name, sub, rating, bg, face }: { dk: string; name: string; sub: string; rating: number; bg: string | null; face: string | null }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Pretendard, system-ui, sans-serif", color: "white" }}>
      {bg && <img src={bg} width={800} height={1000} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "linear-gradient(to bottom, rgba(2,6,23,0.45) 0%, rgba(2,6,23,0.05) 38%, rgba(2,6,23,0.82) 100%)" }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: "100%", height: "100%", padding: "50px 50px 56px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "25px", fontWeight: 900, letterSpacing: "0.14em", color: "#fbbf24" }}>
          오늘의 MVP
          <span style={{ display: "flex", fontSize: "20px", fontWeight: 700, color: "white", opacity: 0.65, letterSpacing: "0" }}>· {dk}</span>
        </div>

        <div style={{ display: "flex", marginTop: "76px", width: "300px", height: "300px", borderRadius: "32px", border: "5px solid rgba(251,191,36,0.92)", background: "#1f2937", overflow: "hidden" }}>
          {face
            ? <img src={face} width={290} height={290} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "120px", fontWeight: 900, color: "#9ca3af" }}>{name.slice(0, 1)}</div>}
        </div>

        <div style={{ display: "flex", marginTop: "34px", fontSize: "58px", fontWeight: 900, letterSpacing: "-0.02em", textAlign: "center" }}>{name}</div>
        <div style={{ display: "flex", marginTop: "12px", fontSize: "27px", fontWeight: 700, opacity: 0.92, padding: "5px 22px", borderRadius: "999px", background: "rgba(255,255,255,0.16)" }}>{sub}</div>

        <div style={{ display: "flex", marginTop: "auto", flexDirection: "column", alignItems: "center", background: "rgba(16,185,129,0.22)", border: "3px solid #6ee7b7", borderRadius: "24px", padding: "16px 48px" }}>
          <span style={{ display: "flex", fontSize: "23px", fontWeight: 700, opacity: 0.85, letterSpacing: "0.1em" }}>경기 평점</span>
          <span style={{ display: "flex", fontSize: "78px", fontWeight: 900, color: "#6ee7b7", lineHeight: 1 }}>{rating.toFixed(1)}</span>
        </div>

        <div style={{ display: "flex", marginTop: "26px", fontSize: "21px", fontWeight: 700, opacity: 0.6, letterSpacing: "0.05em" }}>scorebase.kr · 2026 월드컵</div>
      </div>
    </div>
  );
}

function Fallback() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "white", fontSize: "52px", fontWeight: 900 }}>
      Scorebase 오늘의 MVP
    </div>
  );
}
