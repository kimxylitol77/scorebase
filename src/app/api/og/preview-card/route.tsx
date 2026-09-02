// GET /api/og/preview-card?m={matchId} — 경기 프리뷰 수치카드 (SNS 공유용, 1080×1350 세로 4:5).
// m 생략 시 오늘 낼 경기를 자동 선택(예측 있는 예정 경기 중 Strong Pick 우선 → 가장 임박한 것).
//
// 왜 세로 4:5 인가: 기존 /api/og/* 는 전부 1200×630 링크 프리뷰용이다. 이 카드는 링크가 아니라
// 이미지 자체가 콘텐츠라, 모바일 피드에서 화면을 가장 크게 먹는 4:5 로 간다(Threads·인스타 공용).
//
// 수치 3개는 고정이 아니라 적응형이다 — 근거와 실측은 src/lib/predict/preview-card.ts 헤더 참조.
import { ImageResponse } from "next/og";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { buildPreviewCard, pickCardMatch } from "@/lib/predict/preview-card";

export const runtime = "nodejs";

// 킥오프 전까지 배당·예측이 갱신되므로 짧게.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
};

const SIZE = { width: 1080, height: 1350 };

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


const Wordmark = () => (
  <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "30px", fontWeight: 900, letterSpacing: "-0.02em" }}>
    <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "32px" }}>
      <div style={{ width: "7px", height: "12px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "20px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "26px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "32px", background: "white", borderRadius: "2px" }} />
    </div>
    <span>Scorebase</span>
  </div>
);

const Fallback = (msg: string) =>
  new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: "24px",
          background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)",
          color: "white", fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        <Wordmark />
        <div style={{ display: "flex", fontSize: "34px", fontWeight: 700, color: "#94a3b8" }}>{msg}</div>
      </div>
    ),
    { ...SIZE, headers: CACHE_HEADERS },
  );

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("m");
  const matchId = raw ? Number(raw) : await pickCardMatch(24);

  if (!matchId || !Number.isInteger(matchId)) return Fallback("표시할 경기가 없습니다");

  const card = await buildPreviewCard(matchId);
  if (!card) return Fallback("아직 예측이 준비되지 않았습니다");

  const leagueLabel = LEAGUE_DISPLAY[card.league] ?? card.league;

  const fontText = [
    card.home, card.away, leagueLabel, card.kickoffKst, card.verdict,
    ...card.stats.flatMap((s) => [s.label, s.value, s.note]),
    "당신의 픽은? 댓글로 AI 승률 Scorebase scorebase.kr vs KST 0123456789%.·",
  ].join("");
  const font = await loadFont(fontText);
  if (!font) return Fallback("카드 준비 중입니다");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          padding: "72px 64px",
          background: "linear-gradient(160deg, #0b1120 0%, #14213d 55%, #1b1235 100%)",
          color: "white", fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단 — 브랜드 + 리그·킥오프 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <Wordmark />
          <div
            style={{
              display: "flex", fontSize: "24px", fontWeight: 700,
              padding: "8px 22px", borderRadius: "999px", background: "rgba(255,255,255,0.13)",
            }}
          >
            {leagueLabel} · {card.kickoffKst} KST
          </div>
        </div>

        {/* 매치업 — 한 줄 압축 (히어로 숫자에 자리를 내준다) */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "46px", gap: "6px" }}>
          <div style={{ display: "flex", fontSize: "62px", fontWeight: 900, letterSpacing: "-0.035em" }}>{card.home}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
            <div style={{ display: "flex", fontSize: "30px", fontWeight: 800, color: "#64748b" }}>vs</div>
            <div style={{ display: "flex", fontSize: "62px", fontWeight: 900, letterSpacing: "-0.035em" }}>{card.away}</div>
          </div>
        </div>

        {/* 히어로 숫자 — 첫 수치(승률)를 스크롤 스토퍼로 거대하게.
            스레드 리서치(2026-09-02): 인기 게시물은 큰 숫자 하나 + 짧은 줄이 전부다. 대시보드형 3칸은 광고로 읽힌다. */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "30px" }}>
          <div style={{ display: "flex", fontSize: "36px", fontWeight: 800, color: "#94a3b8" }}>{card.stats[0]?.label ?? "AI 승률"}</div>
          <div style={{ display: "flex", fontSize: "260px", fontWeight: 900, color: "#fde047", letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            {card.stats[0]?.value ?? "-"}
          </div>
          <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#8fa0b8" }}>{card.stats[0]?.note ?? ""}</div>
        </div>

        {/* 보조 수치 — 최대 2줄, 한 줄 압축 */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "42px", gap: "14px" }}>
          {card.stats.slice(1, 3).map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "20px 30px", borderRadius: "18px",
                background: s.hot ? "rgba(253,224,71,0.1)" : "rgba(255,255,255,0.05)",
                border: s.hot ? "2px solid rgba(253,224,71,0.45)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span style={{ fontSize: "27px", fontWeight: 800, color: s.hot ? "#fde047" : "#94a3b8" }}>{s.label}</span>
              <span style={{ fontSize: "40px", fontWeight: 900, color: s.hot ? "#fde047" : "white", letterSpacing: "-0.02em" }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* 하단 — 결론 + 참여 유도 질문 (스레드는 댓글이 노출을 만든다) */}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "flex", fontSize: "36px", fontWeight: 900, color: "#e2e8f0" }}>{card.verdict}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", fontSize: "30px", fontWeight: 900, color: "#fde047", padding: "10px 26px", borderRadius: "999px", border: "2px solid rgba(253,224,71,0.5)" }}>
              당신의 픽은? 댓글로 👇
            </span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "#a5b4fc" }}>scorebase.kr</span>
          </div>
        </div>
      </div>
    ),
    {
      ...SIZE,
      headers: CACHE_HEADERS,
      fonts: [{ name: "Pretendard", data: font, weight: 800 as const, style: "normal" as const }],
    },
  );
}
