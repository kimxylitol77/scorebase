// 동적 OG image — /articles/{slug} 페이지의 공유 미리보기 카드.
// Next.js App Router 가 자동으로 <meta property="og:image"> 메타 태그 생성.
//
// 디자인: 다크 + 그라데이션 배경 + Scorebase 로고 + 매치 요약 (양 팀명·스코어·리그·날짜).
// 매치 연결 안 된 글(ANALYSIS 등) 은 제목 + 리그만.

import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";

export const runtime = "nodejs"; // Prisma 직접 호출 위해 nodejs (edge 도 가능하지만 Neon adapter 필요)
export const alt = "Scorebase";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LEAGUE_LABEL: Record<string, string> = {
  EPL: "프리미어리그",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
  MLS: "MLS",
  UCL: "챔피언스리그",
  WORLD_CUP: "FIFA 월드컵 2026",
  KBO: "KBO 리그",
  NPB: "NPB 일본프로야구",
  MLB: "메이저리그",
  NBA: "NBA",
  NHL: "NHL",
  LOL: "LCK",
};

const LEAGUE_GRADIENT: Record<string, [string, string]> = {
  EPL: ["#6d28d9", "#4c1d95"],
  LALIGA: ["#b45309", "#7c2d12"],
  BUNDESLIGA: ["#a16207", "#854d0e"],
  SERIE_A: ["#0369a1", "#0c4a6e"],
  LIGUE_1: ["#be123c", "#881337"],
  MLS: ["#b91c1c", "#7f1d1d"],
  UCL: ["#4338ca", "#312e81"],
  WORLD_CUP: ["#ea580c", "#c2410c"],
  KBO: ["#1d4ed8", "#1e3a8a"],
  NPB: ["#dc2626", "#991b1b"],
  MLB: ["#059669", "#064e3b"],
  NBA: ["#ea580c", "#9a3412"],
  NHL: ["#0891b2", "#155e75"],
  LOL: ["#db2777", "#9d174d"],
};

const TYPE_LABEL: Record<string, string> = {
  PREVIEW: "프리뷰",
  RECAP: "리뷰",
  ANALYSIS: "분석",
};

export default async function Image({
  params,
}: {
  params: { slug: string };
}) {
  const article = await prisma.article.findUnique({
    where: { slug: params.slug },
    include: {
      match: {
        include: { homeTeam: true, awayTeam: true },
      },
    },
  });

  if (!article) {
    return new ImageResponse(<DefaultCard />, { ...size });
  }

  const [g1, g2] = LEAGUE_GRADIENT[article.league] ?? ["#1f2937", "#0f172a"];
  const leagueLabel = LEAGUE_LABEL[article.league] ?? article.league;
  const typeLabel = TYPE_LABEL[article.type] ?? article.type;
  const m = article.match;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 80px",
          background: `linear-gradient(135deg, ${g1} 0%, ${g2} 100%)`,
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단: 로고 + 리그·타입 */}
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
              gap: "16px",
              fontSize: "32px",
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
              gap: "12px",
              fontSize: "22px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                padding: "6px 18px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.18)",
              }}
            >
              {leagueLabel}
            </span>
            <span
              style={{
                padding: "6px 18px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.18)",
              }}
            >
              {typeLabel}
            </span>
          </div>
        </div>

        {/* 가운데: 매치 또는 제목 */}
        {m ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "30px",
              flex: 1,
              marginTop: "30px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "60px",
                fontSize: "62px",
                fontWeight: 900,
                letterSpacing: "-0.03em",
                width: "100%",
                justifyContent: "center",
              }}
            >
              <span style={{ textAlign: "right", flex: 1, maxWidth: "40%" }}>
                {truncateName(m.awayTeam.name)}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: "160px",
                  fontSize: "72px",
                  fontVariantNumeric: "tabular-nums",
                  background: "rgba(0,0,0,0.25)",
                  borderRadius: "20px",
                  padding: "14px 28px",
                }}
              >
                {m.status === "FINISHED" && m.awayScore != null && m.homeScore != null
                  ? `${m.awayScore} - ${m.homeScore}`
                  : "vs"}
              </span>
              <span style={{ flex: 1, maxWidth: "40%" }}>
                {truncateName(m.homeTeam.name)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "24px",
                opacity: 0.85,
                marginTop: "10px",
              }}
            >
              {formatKstDate(m.startTime)}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              fontSize: "54px",
              fontWeight: 900,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              textAlign: "center",
              padding: "0 40px",
            }}
          >
            {article.title}
          </div>
        )}

        {/* 하단: 도메인 */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            fontSize: "20px",
            opacity: 0.75,
            letterSpacing: "0.08em",
          }}
        >
          scorebase.kr
        </div>
      </div>
    ),
    { ...size },
  );
}

function BarMark() {
  // 4개 점점 커지는 막대 — 헤더 로고와 동일 컨셉, OG 용 단순화 (그라디언트 X 단색)
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "4px",
        height: "36px",
      }}
    >
      <div style={{ width: "7px", height: "14px", background: "white", opacity: 0.55, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "22px", background: "white", opacity: 0.75, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "30px", background: "white", opacity: 0.9, borderRadius: "2px" }} />
      <div style={{ width: "7px", height: "36px", background: "white", borderRadius: "2px" }} />
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
        fontSize: "72px",
        fontWeight: 900,
      }}
    >
      Scorebase
    </div>
  );
}

function truncateName(name: string, max = 18): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

function formatKstDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  const h = kst.getUTCHours();
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${day} · KST ${h}:${mm}`;
}
