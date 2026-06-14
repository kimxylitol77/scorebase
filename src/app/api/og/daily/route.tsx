// GET /api/og/daily?d=YYYY-MM-DD[&size=square]  — 오늘의 주요 경기 종합 카드.
//
// 기본 1200×630(스레드/OG). ?size=square → 1080×1080 인스타 피드용(경기 더 많이).
// Threads 자동 포스팅 + 수동 SNS 발행 공용 public 이미지.
// 디자인/그라데이션/BarMark 은 articles/[slug]/opengraph-image.tsx 와 동일 컨셉.

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { leaguesForSport, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { kstDayWindow, kstHHmm } from "@/lib/threads/kst";

export const runtime = "nodejs";

// 당일 라인업/스코어가 바뀌므로 OG 카드만큼 길게 캐시하지 않는다(짧게).
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const square = url.searchParams.get("size") === "square";
  const size = square ? { width: 1080, height: 1080 } : { width: 1200, height: 630 };
  const maxRows = square ? 9 : 6;
  // 월드컵 전용 카드 (comp=wc) — 내일 예고(t=tomorrow)면 타이틀에 "내일".
  const wc = url.searchParams.get("comp") === "wc";
  const tomorrow = url.searchParams.get("t") === "tomorrow";

  try {
    const { start, end, label } = kstDayWindow(url.searchParams.get("d"));

    const allLeagues = leaguesForSport("all");
    const leagueFilter = wc ? allLeagues.filter((l) => l === "WORLD_CUP") : allLeagues;
    // 리그 우선순위 = ALL_LEAGUES(SPORTS 정의 순서) 인덱스.
    const priority = new Map(allLeagues.map((lg, i) => [lg, i]));

    const matches = await prisma.match.findMany({
      where: { league: { in: leagueFilter }, startTime: { gte: start, lt: end } },
      include: {
        homeTeam: { select: { name: true } },
        awayTeam: { select: { name: true } },
      },
      orderBy: { startTime: "asc" },
      take: 200,
    });

    const liveCount = matches.filter((m) => m.status === "LIVE").length;

    // 정렬: LIVE 먼저 → 리그 우선순위 → 이른 시간
    const sorted = [...matches].sort((a, b) => {
      const al = a.status === "LIVE" ? 0 : 1;
      const bl = b.status === "LIVE" ? 0 : 1;
      if (al !== bl) return al - bl;
      const ap = priority.get(a.league) ?? 999;
      const bp = priority.get(b.league) ?? 999;
      if (ap !== bp) return ap - bp;
      return a.startTime.getTime() - b.startTime.getTime();
    });

    const rows = sorted.slice(0, maxRows).map((m) => ({
      leagueLabel: LEAGUE_DISPLAY[m.league] ?? m.league,
      home: toKoreanTeamName(m.homeTeam.name, m.league),
      away: toKoreanTeamName(m.awayTeam.name, m.league),
      time: kstHHmm(m.startTime),
      live: m.status === "LIVE",
    }));

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            padding: square ? "60px 60px" : "52px 64px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            color: "white",
            fontFamily: "Pretendard, system-ui, sans-serif",
          }}
        >
          {/* 상단: 로고 + 날짜 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "14px",
                fontSize: "30px",
                fontWeight: 900,
                letterSpacing: "-0.02em",
              }}
            >
              <BarMark />
              <span>Scorebase</span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "20px",
                fontWeight: 700,
                padding: "6px 18px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.14)",
              }}
            >
              {label}
            </div>
          </div>

          {/* 타이틀 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "18px",
              marginTop: square ? "30px" : "26px",
              marginBottom: "6px",
            }}
          >
            <span style={{ fontSize: "46px", fontWeight: 900, letterSpacing: "-0.03em" }}>
              {wc ? (tomorrow ? "내일의 월드컵 경기" : "오늘의 월드컵 경기") : "오늘의 주요 경기"}
            </span>
            {liveCount > 0 && (
              <span style={{ display: "flex", fontSize: "22px", fontWeight: 800, color: "#f87171" }}>
                ● LIVE {liveCount}
              </span>
            )}
          </div>

          {/* 경기 리스트 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: square ? "13px" : "11px",
              flex: 1,
              marginTop: "16px",
              justifyContent: square ? "center" : "flex-start",
            }}
          >
            {rows.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "30px",
                  opacity: 0.7,
                }}
              >
                오늘 예정된 경기가 없습니다
              </div>
            ) : (
              rows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "18px",
                    padding: "13px 22px",
                    background: "rgba(255,255,255,0.07)",
                    borderRadius: "16px",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      fontSize: "18px",
                      fontWeight: 700,
                      color: "#93c5fd",
                      width: "150px",
                    }}
                  >
                    {r.leagueLabel}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      flex: 1,
                      fontSize: "25px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {r.home}
                    <span style={{ opacity: 0.45, margin: "0 10px" }}>vs</span>
                    {r.away}
                  </span>
                  <span
                    style={{
                      display: "flex",
                      fontSize: "22px",
                      fontWeight: 700,
                      opacity: 0.85,
                      color: r.live ? "#f87171" : "white",
                    }}
                  >
                    {r.live ? "LIVE" : r.time}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* 하단 도메인 */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              fontSize: "18px",
              opacity: 0.7,
              letterSpacing: "0.06em",
              marginTop: "8px",
            }}
          >
            scorebase.kr/board
          </div>
        </div>
      ),
      { ...size, headers: CACHE_HEADERS },
    );
  } catch (e) {
    console.warn("[og/daily] render fail:", (e as Error).message);
    return new ImageResponse(<DefaultCard />, {
      ...size,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }
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

function DefaultCard() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 100%)",
        color: "white",
        fontSize: "64px",
        fontWeight: 900,
      }}
    >
      Scorebase
    </div>
  );
}
