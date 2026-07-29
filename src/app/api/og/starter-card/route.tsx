// GET /api/og/starter-card?m={matchId} — 선발 투수 맞대결 카드 짤 (개별 공유·게시판 첨부용).
// 투수 사진 2장 + 승패 + ERA·WHIP·K/9·최근 3등판 + AI 승률 바. /predictions/starters 카드의 이미지판.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { kstHHmm } from "@/lib/threads/kst";
import { parseStarter, pitcherPhoto, fmtStat, type StarterJson } from "@/lib/predict/starter-card";

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

/** 투수 얼굴 — 사진 없으면 이니셜 원형(페이지의 PitcherAvatar 와 같은 규칙). */
function Face({ src, name, accent }: { src: string | null; name: string; accent: string }) {
  const s = 140;
  return src ? (
    <img
      src={src}
      width={s}
      height={s}
      style={{ width: s, height: s, borderRadius: 999, objectFit: "cover", border: `5px solid ${accent}` }}
    />
  ) : (
    <div
      style={{
        width: s,
        height: s,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.12)",
        border: `5px solid ${accent}`,
        fontSize: 54,
        fontWeight: 900,
        color: "#e2e8f0",
      }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

/** 지표 한 줄 — 좌(홈) 값 · 라벨 · 우(원정) 값. 우위 쪽만 색으로 강조. */
function StatLine({
  label,
  home,
  away,
  lowerBetter,
  digits = 2,
}: {
  label: string;
  home?: number;
  away?: number;
  lowerBetter: boolean;
  digits?: number;
}) {
  const ok = (v?: number) => v != null && !Number.isNaN(v) && v >= 0;
  const both = ok(home) && ok(away);
  const homeWins = both && home !== away && (lowerBetter ? home! < away! : home! > away!);
  const awayWins = both && home !== away && !homeWins;
  return (
    <div style={{ display: "flex", alignItems: "center", width: "100%", padding: "4px 0" }}>
      <span
        style={{
          display: "flex",
          justifyContent: "flex-end",
          width: "38%",
          fontSize: 27,
          fontWeight: homeWins ? 900 : 600,
          color: homeWins ? "#34d399" : "#cbd5e1",
        }}
      >
        {fmtStat(home, digits)}
      </span>
      <span style={{ display: "flex", justifyContent: "center", width: "24%", fontSize: 20, fontWeight: 700, color: "#64748b" }}>
        {label}
      </span>
      <span
        style={{
          display: "flex",
          justifyContent: "flex-start",
          width: "38%",
          fontSize: 27,
          fontWeight: awayWins ? 900 : 600,
          color: awayWins ? "#60a5fa" : "#cbd5e1",
        }}
      >
        {fmtStat(away, digits)}
      </span>
    </div>
  );
}

function Side({
  face,
  s,
  team,
  accent,
  align,
}: {
  face: string | null;
  s: StarterJson | null;
  team: string;
  accent: string;
  align: "flex-start" | "flex-end";
}) {
  const name = s?.name ?? "선발 미정";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "flex-start" ? "flex-start" : "flex-end", gap: 8, width: 340 }}>
      <Face src={face} name={name} accent={accent} />
      <span style={{ display: "flex", fontSize: 36, fontWeight: 900, letterSpacing: "-0.02em", color: "white" }}>{name}</span>
      <span style={{ display: "flex", fontSize: 21, fontWeight: 600, color: "#94a3b8" }}>
        {team}
        {s?.wins != null ? ` · ${s.wins}승 ${s.losses ?? 0}패` : ""}
      </span>
    </div>
  );
}

export async function GET(req: Request) {
  const matchId = Number(new URL(req.url).searchParams.get("m"));

  const match = Number.isInteger(matchId)
    ? await prisma.match
        .findUnique({
          where: { id: matchId },
          select: {
            league: true,
            startTime: true,
            status: true,
            homeScore: true,
            awayScore: true,
            predHome: true,
            predAway: true,
            homeStarter: true,
            awayStarter: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        })
        .catch(() => null)
    : null;

  if (!match) {
    return new ImageResponse(<Fallback />, { ...SIZE, headers: { "Cache-Control": "public, max-age=60" } });
  }

  const hs = parseStarter(match.homeStarter);
  const as = parseStarter(match.awayStarter);
  const home = toKoreanTeamName(match.homeTeam.name, match.league) || match.homeTeam.name;
  const away = toKoreanTeamName(match.awayTeam.name, match.league) || match.awayTeam.name;
  const [hFace, aFace] = await Promise.all([
    toDataUri(pitcherPhoto(match.league, hs)),
    toDataUri(pitcherPhoto(match.league, as)),
  ]);

  const finished = match.status === "FINISHED";
  const statusLabel = finished
    ? `종료 ${match.homeScore ?? 0} : ${match.awayScore ?? 0}`
    : match.status === "LIVE"
      ? "LIVE"
      : `${kstHHmm(match.startTime)} KST`;

  const ph = match.predHome != null ? Math.round(match.predHome * 100) : null;
  const pa = match.predAway != null ? Math.round(match.predAway * 100) : null;
  const hasPred = ph != null && pa != null;
  const hasStat = !!(hs || as);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "30px 56px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          color: "white",
          fontFamily: "Pretendard, system-ui, sans-serif",
        }}
      >
        {/* 상단 — 로고 + 리그·상태 */}
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
            {match.league} 선발 매치업 · {statusLabel}
          </div>
        </div>

        {/* 투수 대면 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", marginTop: 18 }}>
          <Side face={hFace} s={hs} team={home} accent="#34d399" align="flex-start" />
          <span style={{ display: "flex", fontSize: 34, fontWeight: 900, color: "#475569", paddingBottom: 50 }}>VS</span>
          <Side face={aFace} s={as} team={away} accent="#60a5fa" align="flex-end" />
        </div>

        {/* AI 승률 */}
        {hasPred ? (
          <div style={{ display: "flex", flexDirection: "column", width: "100%", marginTop: 20, gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, fontWeight: 800 }}>
              <span style={{ color: "#34d399" }}>{ph}%</span>
              <span style={{ color: "#64748b", fontSize: 18, fontWeight: 700 }}>AI 승률</span>
              <span style={{ color: "#60a5fa" }}>{pa}%</span>
            </div>
            <div style={{ display: "flex", width: "100%", height: 14, borderRadius: 999, overflow: "hidden", background: "rgba(255,255,255,0.1)" }}>
              <div style={{ display: "flex", width: `${ph}%`, background: "#34d399" }} />
              <div style={{ display: "flex", width: `${100 - ph!}%`, background: "#60a5fa" }} />
            </div>
          </div>
        ) : null}

        {/* 지표 비교 */}
        {hasStat ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              marginTop: 14,
              padding: "6px 24px",
              borderRadius: 18,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <StatLine label="ERA" home={hs?.era} away={as?.era} lowerBetter />
            <StatLine label="WHIP" home={hs?.whip} away={as?.whip} lowerBetter />
            <StatLine label="K/9" home={hs?.k9} away={as?.k9} lowerBetter={false} digits={1} />
            {hs?.recentEra != null || as?.recentEra != null ? (
              <StatLine label="최근 3등판" home={hs?.recentEra} away={as?.recentEra} lowerBetter />
            ) : null}
          </div>
        ) : null}

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
