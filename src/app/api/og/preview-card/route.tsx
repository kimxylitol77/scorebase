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

        {/* 매치업 — 세로 카드라 두 줄로 크게 */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "58px", gap: "10px" }}>
          <div style={{ display: "flex", fontSize: "76px", fontWeight: 900, letterSpacing: "-0.035em" }}>{card.home}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
            <div style={{ display: "flex", fontSize: "34px", fontWeight: 800, color: "#64748b" }}>vs</div>
            <div style={{ display: "flex", height: "2px", flex: 1, background: "rgba(255,255,255,0.14)" }} />
          </div>
          <div style={{ display: "flex", fontSize: "76px", fontWeight: 900, letterSpacing: "-0.035em" }}>{card.away}</div>
        </div>

        {/* 수치 3칸 — 세로 스택 */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "56px", gap: "20px" }}>
          {card.stats.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex", flexDirection: "column", gap: "8px",
                padding: "26px 32px", borderRadius: "22px",
                background: s.hot ? "rgba(253,224,71,0.11)" : "rgba(255,255,255,0.055)",
                border: s.hot ? "2px solid rgba(253,224,71,0.5)" : "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "27px", fontWeight: 800, color: s.hot ? "#fde047" : "#94a3b8" }}>{s.label}</span>
                <span style={{ fontSize: "52px", fontWeight: 900, color: s.hot ? "#fde047" : "white", letterSpacing: "-0.02em" }}>
                  {s.value}
                </span>
              </div>
              <div style={{ display: "flex", fontSize: "23px", fontWeight: 600, color: "#8fa0b8" }}>{s.note}</div>
            </div>
          ))}
        </div>

        {/* 하단 — 한 줄 결론 + 도메인 */}
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", fontSize: "34px", fontWeight: 800, color: "#e2e8f0" }}>{card.verdict}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "26px", fontWeight: 800, color: "#7c8ba1" }}>적중률까지 그대로 공개합니다</span>
            <span style={{ fontSize: "28px", fontWeight: 900, color: "#a5b4fc" }}>scorebase.kr</span>
          </div>
        </div>
      </div>
    ),
    { ...SIZE, headers: CACHE_HEADERS },
  );
}
