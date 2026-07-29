// GET /api/og/pitcher-card?m={matchId}&s=home|away — 선발 투수 1명 개인 카드 짤.
// 매치업판(/api/og/starter-card)의 투수 단위 버전. 사진 + 팀·승패 + ERA·WHIP·K/9·최근 3등판 타일.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { kstHHmm } from "@/lib/threads/kst";
import { parseStarter, pitcherPhoto, fmtStat, hasStats } from "@/lib/predict/starter-card";

export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600",
};
const SIZE = { width: 1200, height: 630 };

/** 외부 이미지를 base64 data URI 로 — satori 가 외부 URL 을 직접 못 가져오는 경우 회피. */
async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") ?? "image/png";
    if (!ct.startsWith("image/")) return null;
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
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
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        color: "white",
        fontSize: "56px",
        fontWeight: 900,
      }}
    >
      Scorebase
    </div>
  );
}

/** 지표 타일 — 값이 없으면 "—". */
function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flexGrow: 1,
        padding: "18px 0",
        borderRadius: 18,
        background: "rgba(255,255,255,0.07)",
      }}
    >
      <span style={{ display: "flex", fontSize: 19, fontWeight: 700, color: "#94a3b8" }}>{label}</span>
      <span style={{ display: "flex", fontSize: 46, fontWeight: 900, color: "white" }}>{value}</span>
      {hint ? <span style={{ display: "flex", fontSize: 17, color: "#64748b", fontWeight: 600 }}>{hint}</span> : null}
    </div>
  );
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const matchId = Number(url.searchParams.get("m"));
  const sideParam = url.searchParams.get("s");
  const side = sideParam === "away" ? "away" : "home";

  const match = Number.isInteger(matchId)
    ? await prisma.match
        .findUnique({
          where: { id: matchId },
          select: {
            league: true,
            startTime: true,
            homeStarter: true,
            awayStarter: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
        .catch(() => null)
    : null;

  const s = match ? parseStarter(side === "home" ? match.homeStarter : match.awayStarter) : null;
  if (!match || !s?.name) {
    return new ImageResponse(<Fallback />, { ...SIZE, headers: { "Cache-Control": "public, max-age=60" } });
  }

  const home = toKoreanTeamName(match.homeTeam.name, match.league) || match.homeTeam.name;
  const away = toKoreanTeamName(match.awayTeam.name, match.league) || match.awayTeam.name;
  const team = side === "home" ? home : away;
  const opponent = side === "home" ? away : home;
  const face = await toDataUri(pitcherPhoto(match.league, s));
  const photoSize = 300;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "40px 56px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단 — 로고 + 리그·상대 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, fontWeight: 900, letterSpacing: "-0.02em" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 30 }}>
              <div style={{ width: 7, height: 11, background: "white", opacity: 0.55, borderRadius: 2 }} />
              <div style={{ width: 7, height: 18, background: "white", opacity: 0.75, borderRadius: 2 }} />
              <div style={{ width: 7, height: 24, background: "white", opacity: 0.9, borderRadius: 2 }} />
              <div style={{ width: 7, height: 30, background: "white", borderRadius: 2 }} />
            </div>
            <span>Scorebase</span>
          </div>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 700, padding: "6px 18px", borderRadius: 999, background: "rgba(255,255,255,0.14)" }}>
            {match.league} 선발 · {kstHHmm(match.startTime)} KST vs {opponent}
          </div>
        </div>

        {/* 사진 + 이름 */}
        <div style={{ display: "flex", alignItems: "center", gap: 44, marginTop: 34 }}>
          {face ? (
            <img
              src={face}
              width={photoSize}
              height={photoSize}
              style={{
                width: photoSize,
                height: photoSize,
                borderRadius: 999,
                objectFit: "contain",
                objectPosition: "50% 100%",
                background: "#e2e8f0",
                border: "6px solid #34d399",
              }}
            />
          ) : (
            <div
              style={{
                width: photoSize,
                height: photoSize,
                borderRadius: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(255,255,255,0.12)",
                border: "6px solid #34d399",
                fontSize: 120,
                fontWeight: 900,
                color: "#e2e8f0",
              }}
            >
              {s.name.slice(0, 1)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ display: "flex", fontSize: 68, fontWeight: 900, letterSpacing: "-0.03em" }}>{s.name}</span>
            <span style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#cbd5e1" }}>
              {team}
              {s.wins != null ? ` · ${s.wins}승 ${s.losses ?? 0}패` : ""}
              {s.ip ? ` · ${s.ip}이닝` : ""}
            </span>
          </div>
        </div>

        {/* 지표 타일 — 지표가 전무하면 빈 타일 대신 사유를 적는다 */}
        {hasStats(s) ? (
          <div style={{ display: "flex", gap: 16, marginTop: 30 }}>
            <Tile label="ERA" value={fmtStat(s.era)} />
            <Tile label="WHIP" value={fmtStat(s.whip)} />
            <Tile label="K/9" value={fmtStat(s.k9, 1)} />
            <Tile
              label="최근 3등판"
              value={fmtStat(s.recentEra)}
              hint={s.recentIp != null ? `평균 ${fmtStat(s.recentIp, 1)}이닝` : undefined}
            />
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 30,
              padding: "28px 0",
              borderRadius: 18,
              background: "rgba(255,255,255,0.05)",
            }}
          >
            <span style={{ display: "flex", fontSize: 30, fontWeight: 800, color: "#cbd5e1" }}>시즌 기록 미집계</span>
            <span style={{ display: "flex", marginTop: 6, fontSize: 20, fontWeight: 600, color: "#64748b" }}>
              리그 공식 기록이 들어오면 자동으로 채워집니다
            </span>
          </div>
        )}

        {/* 푸터 */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 18, color: "#64748b", fontWeight: 600 }}>
          <span>scorebase.kr — 선발 매치업 · AI 데이터 예측</span>
          <span>지표는 시즌 누적 · 참고용</span>
        </div>
      </div>
    ),
    { ...SIZE, headers: CACHE_HEADERS },
  );
}
