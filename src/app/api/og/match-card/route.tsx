// GET /api/og/match-card?m={matchId} — 매치 1건 스탯카드 짤 (게시판 봇 글 첨부용).
// AI 승률 바 + 배당 + (MLB) 선발 매치업. 커뮤니티 리서치(2026-07-05) 승자 포맷 "캡처 1장" 대응.
// 디자인·폰트 처리(자동 CJK 글리프)는 /api/og/daily 와 동일 컨셉.

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { kstHHmm } from "@/lib/threads/kst";

export const runtime = "nodejs";

// 배당·예측이 경기 전까지 갱신되므로 캐시 짧게. 종료 후에는 값이 안 변해 CDN 재사용 무해.
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
};

interface Starter {
  name?: string;
  era?: number;
}

function parseStarter(json: unknown): Starter | null {
  if (!json) return null;
  try {
    const s = typeof json === "string" ? JSON.parse(json) : json;
    if (s && typeof s === "object" && typeof (s as Starter).name === "string") return s as Starter;
    return null;
  } catch {
    return null;
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = Number(url.searchParams.get("m"));

  const size = { width: 1200, height: 630 };

  const match = Number.isInteger(matchId)
    ? await prisma.match.findUnique({
        where: { id: matchId },
        select: {
          league: true,
          startTime: true,
          status: true,
          homeScore: true,
          awayScore: true,
          predHome: true,
          predDraw: true,
          predAway: true,
          oddsHome: true,
          oddsDraw: true,
          oddsAway: true,
          homeStarter: true,
          awayStarter: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      })
    : null;

  if (!match) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "white",
            fontSize: "56px",
            fontWeight: 900,
          }}
        >
          Scorebase
        </div>
      ),
      { ...size, headers: CACHE_HEADERS },
    );
  }

  const home = toKoreanTeamName(match.homeTeam.name, match.league);
  const away = toKoreanTeamName(match.awayTeam.name, match.league);
  const leagueLabel = LEAGUE_DISPLAY[match.league] ?? match.league;
  const finished = match.status === "FINISHED";

  // AI 승률 스택 바 — 무승부 예측 없는 종목은 홈/원정 2분할
  const hasPred = match.predHome != null && match.predAway != null;
  const draw = match.predDraw ?? 0;
  const segs = hasPred
    ? [
        { label: home, v: match.predHome!, color: "#34d399" },
        ...(draw > 0.001 ? [{ label: "무", v: draw, color: "#64748b" }] : []),
        { label: away, v: match.predAway!, color: "#60a5fa" },
      ]
    : [];

  const hs = parseStarter(match.homeStarter);
  const as = parseStarter(match.awayStarter);
  const starterLine =
    hs?.name && as?.name
      ? `선발 ${hs.name}${hs.era != null ? ` (ERA ${hs.era.toFixed(2)})` : ""} vs ${as.name}${as.era != null ? ` (ERA ${as.era.toFixed(2)})` : ""}`
      : null;

  const oddsCells =
    match.oddsHome != null
      ? [
          { k: "홈", v: match.oddsHome },
          ...(match.oddsDraw != null ? [{ k: "무", v: match.oddsDraw }] : []),
          { k: "원정", v: match.oddsAway },
        ].filter((c): c is { k: string; v: number } => c.v != null)
      : [];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "52px 64px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단: 로고 + 리그·킥오프 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: "28px", fontWeight: 900, letterSpacing: "-0.02em" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "32px" }}>
              <div style={{ width: "7px", height: "12px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
              <div style={{ width: "7px", height: "20px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
              <div style={{ width: "7px", height: "26px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
              <div style={{ width: "7px", height: "32px", background: "white", borderRadius: "2px" }} />
            </div>
            <span>Scorebase</span>
          </div>
          <div style={{ display: "flex", fontSize: "20px", fontWeight: 700, padding: "6px 18px", borderRadius: "999px", background: "rgba(255,255,255,0.14)" }}>
            {leagueLabel} · {finished ? "경기 종료" : `${kstHHmm(match.startTime)} KST`}
          </div>
        </div>

        {/* 매치업 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "36px", marginTop: "64px" }}>
          <span style={{ fontSize: "58px", fontWeight: 900, letterSpacing: "-0.03em" }}>{home}</span>
          <span style={{ fontSize: "34px", fontWeight: 700, color: "#94a3b8" }}>
            {finished && match.homeScore != null ? `${match.homeScore} : ${match.awayScore}` : "vs"}
          </span>
          <span style={{ fontSize: "58px", fontWeight: 900, letterSpacing: "-0.03em" }}>{away}</span>
        </div>
        {starterLine ? (
          <div style={{ display: "flex", justifyContent: "center", marginTop: "18px", fontSize: "24px", color: "#cbd5e1", fontWeight: 600 }}>
            {starterLine}
          </div>
        ) : null}

        {/* AI 승률 바 */}
        {hasPred ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: "52px", gap: "12px" }}>
            <div style={{ display: "flex", fontSize: "20px", fontWeight: 700, color: "#94a3b8" }}>AI 모델 승률</div>
            <div style={{ display: "flex", width: "100%", height: "56px", borderRadius: "14px", overflow: "hidden" }}>
              {segs.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: `${Math.max(s.v * 100, 8)}%`,
                    background: s.color,
                    color: "#0f172a",
                    fontSize: "24px",
                    fontWeight: 800,
                  }}
                >
                  {pct(s.v)}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "20px", fontWeight: 700, color: "#cbd5e1" }}>
              <span>{home}</span>
              <span>{away}</span>
            </div>
          </div>
        ) : null}

        {/* 배당 */}
        {oddsCells.length > 0 ? (
          <div style={{ display: "flex", gap: "16px", marginTop: hasPred ? "28px" : "56px" }}>
            {oddsCells.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexGrow: 1,
                  padding: "14px 0",
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.08)",
                }}
              >
                <span style={{ fontSize: "18px", color: "#94a3b8", fontWeight: 700 }}>{c.k}</span>
                <span style={{ fontSize: "30px", fontWeight: 900 }}>{c.v.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {/* 푸터 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: "19px", color: "#64748b", fontWeight: 600 }}>
          <span>scorebase.kr — AI 데이터 예측 · 시스템 자동 채점</span>
          <span>배당은 참고용 · 베팅 책임은 본인에게</span>
        </div>
      </div>
    ),
    { ...size, headers: CACHE_HEADERS },
  );
}
