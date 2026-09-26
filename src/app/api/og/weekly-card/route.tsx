// GET /api/og/weekly-card?league=EPL&end=YYYY-MM-DD&kind=mvp|top|table — 빅5 주간 리뷰 인포그래픽 카드.
// 1080×1350(4:5). 주간 리뷰 글 본문 삽입 + 구글 이미지 색인 + SNS 재사용. 수치는 글과 같은 빌더
// (buildSoccerWeeklyReview·getWeeklyBestXi)를 읽어 본문과 카드가 절대 어긋나지 않게 한다.
//   mvp   — 주간 MVP 선수 히어로(사진·평점·골·도움·몸값)
//   top   — 주간 평점 TOP 10 리더보드 + MVP 사진
//   table — 팀 주간 승점표(로고·승무패·득실·승점·시장 기대 대비 ▲▼)
//   heat  — 주간 MVP 활동 히트맵(경기 터치 좌표 10×10 + 3×3 존 비율, 창 안 경기 없으면 시즌 누적)
// satori 주의 — 모든 컨테이너 display:flex, 고정폭 요소 flexShrink:0.
import { ImageResponse } from "next/og";
import { Frame, Avatar, Logo, toDataUri, fmtRange, loadCardFonts, CARD_W, CARD_H, CARD_CACHE } from "@/components/og/weekly-frame";
import { prisma } from "@/lib/db";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { buildSoccerWeeklyReview, type SoccerWeeklyReviewData } from "@/lib/soccer/weekly-review";
import { getWeeklyBestXi, type WeeklyBestXi } from "@/lib/soccer/weekly-best-xi";
import type { TodPlayer } from "@/lib/sports/thesports/team-of-day";
import { getMvpHeat, SMOOTH_X, SMOOTH_Y, type MvpHeat } from "@/lib/soccer/mvp-heat";
import { toKoreanTeamName } from "@/lib/team-names";

export const runtime = "nodejs";


const LEAGUE_GRADIENT: Record<string, [string, string]> = {
  EPL: ["#3b0764", "#0f172a"],
  LALIGA: ["#7c2d12", "#0f172a"],
  BUNDESLIGA: ["#713f12", "#0f172a"],
  SERIE_A: ["#0c4a6e", "#0f172a"],
  LIGUE_1: ["#881337", "#0f172a"],
};

const POS_KO: Record<string, string> = { G: "GK", D: "DF", M: "MF", F: "FW" };

function fmtValue(eur: number | null | undefined): string | null {
  if (!eur || eur <= 0) return null;
  return eur >= 1e6 ? `€${Math.round(eur / 1e6)}M` : `€${Math.round(eur / 1000)}k`;
}

function ratingColor(r: number): string {
  if (r >= 8) return "#34d399";
  if (r >= 7) return "#fbbf24";
  return "#cbd5e1";
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const league = (sp.get("league") ?? "EPL").toUpperCase();
  const end = sp.get("end") ?? undefined;
  const kind = sp.get("kind") ?? "mvp";

  const fonts = await loadCardFonts();
  const opts = { width: CARD_W, height: CARD_H, fonts, headers: CARD_CACHE };

  const data = await buildSoccerWeeklyReview(league, end).catch(() => null);
  if (!data) {
    return new ImageResponse(<Fallback league={league} />, { ...opts, headers: { "Cache-Control": "public, max-age=60" } });
  }
  const leagueKo = LEAGUE_DISPLAY[league] ?? league;
  const grad = LEAGUE_GRADIENT[league] ?? ["#1e293b", "#0f172a"];

  if (kind === "table") {
    const rows = data.teams.slice(0, 10);
    const teams = await prisma.team.findMany({ where: { id: { in: rows.map((r) => r.teamId) } }, select: { id: true, logoUrl: true } });
    const logoById = new Map(teams.map((t) => [t.id, t.logoUrl]));
    const logos = await Promise.all(rows.map((r) => toDataUri(logoById.get(r.teamId))));
    return new ImageResponse(
      <Frame grad={grad} leagueKo={leagueKo} range={fmtRange(data.from, data.to)} title="주간 승점 순위" sub={`이번 주 ${data.matchCount}경기 · 승점 순 · ▲▼ 는 베팅 시장 기대 승점 대비`}>
        <TableBody rows={rows} logos={logos} />
      </Frame>,
      opts,
    );
  }

  const xi = await getWeeklyBestXi(league, data.to).catch(() => null);
  const ranked = [...(xi?.xi ?? []), ...(xi?.bench ?? [])].sort((a, b) => b.rating - a.rating);
  const mvp = data.mvpPlayer ?? ranked[0] ?? null;
  if (!mvp) {
    return new ImageResponse(<Fallback league={league} />, { ...opts, headers: { "Cache-Control": "public, max-age=60" } });
  }
  // TodPlayer.logo 는 선수 사진, 팀 로고는 logoByTeam[영문 팀명].
  const teamLogo = (p: TodPlayer) => xi?.logoByTeam[p.country] ?? null;
  const [pmv, photo] = await Promise.all([
    prisma.playerMarketValue.findUnique({ where: { id: mvp.id }, select: { currentValue: true } }),
    toDataUri(mvp.logo),
  ]);

  if (kind === "top") {
    const top = ranked.slice(0, 10);
    const logos = await Promise.all(top.map((p) => toDataUri(teamLogo(p))));
    return new ImageResponse(
      <Frame grad={grad} leagueKo={leagueKo} range={fmtRange(data.from, data.to)} title="주간 평점 TOP 10" sub={`이번 주 ${data.matchCount}경기 · 경기 평점 순`}>
        <TopBody players={top} logos={logos} photo={photo} />
      </Frame>,
      opts,
    );
  }

  if (kind === "heat") {
    const heat = getMvpHeat(mvp.id, data.from, data.to);
    if (!heat) {
      return new ImageResponse(<Fallback league={league} />, { ...opts, headers: { "Cache-Control": "public, max-age=60" } });
    }
    const sub = heat.source === "match"
      ? heat.matches.map((m) => `${Number(m.date.slice(5, 7))}/${Number(m.date.slice(8))} vs ${toKoreanTeamName(m.opp) || m.opp} (${m.ha}) ${m.score.replace("-", ":")} ${m.result}`).join(" · ")
      : `${heat.seasonLabel.replace(/\b([A-Z_0-9]+)$/, (c) => LEAGUE_DISPLAY[c] ?? c)} 시즌 누적 ${heat.seasonMatches}경기 — 이번 주 경기 좌표는 아직 수집 전`;
    return new ImageResponse(
      <Frame grad={grad} leagueKo={leagueKo} range={fmtRange(data.from, data.to)} title="주간 MVP 활동 히트맵" sub={sub}>
        <HeatBody p={mvp} photo={photo} heat={heat} />
      </Frame>,
      opts,
    );
  }

  const logo = await toDataUri(teamLogo(mvp));
  return new ImageResponse(
    <Frame grad={grad} leagueKo={leagueKo} range={fmtRange(data.from, data.to)} title="주간 MVP" sub={`이번 주 ${data.matchCount}경기 · 경기 평점 1위`}>
      <MvpBody p={mvp} photo={photo} logo={logo} value={fmtValue(pmv?.currentValue)} data={data} />
    </Frame>,
    opts,
  );
}

// ---------- mvp ----------

function MvpBody({ p, photo, logo, value, data }: {
  p: TodPlayer; photo: string | null; logo: string | null; value: string | null; data: SoccerWeeklyReviewData;
}) {
  const teamKo = p.countryKo || p.country;
  const color = ratingColor(p.rating);
  const stats: [string, string][] = [
    ["평점", p.rating.toFixed(2)],
    ["골", String(p.goals)],
    ["도움", String(p.assists)],
    ["몸값", value ?? "-"],
  ];
  const runners = [...data.xiBrief].filter((r) => r.name !== p.name).slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
        <Avatar src={photo} size={300} ring={color} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <span style={{ fontSize: "62px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{p.name}</span>
          {p.nameEn && p.nameEn !== p.name && <span style={{ fontSize: "24px", opacity: 0.6, marginTop: "6px" }}>{p.nameEn}</span>}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "18px", fontSize: "26px", fontWeight: 700 }}>
            <Logo src={logo} size={44} />
            <span>{teamKo}</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span style={{ opacity: 0.8 }}>{POS_KO[p.pos] ?? p.pos}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", marginTop: "40px" }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "22px 0", borderRadius: "20px", background: "rgba(255,255,255,0.08)", alignItems: "center", border: k === "평점" ? `2px solid ${color}` : "2px solid transparent" }}>
            <span style={{ fontSize: "20px", opacity: 0.65 }}>{k}</span>
            <span style={{ fontSize: "58px", fontFamily: "Oswald", fontWeight: 700, color: k === "평점" ? color : "white", lineHeight: 1.1, marginTop: "6px" }}>{v}</span>
          </div>
        ))}
      </div>

      {data.mvpCoach && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "28px", padding: "22px 30px", borderRadius: "20px", background: "rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "20px", opacity: 0.65 }}>주간 MVP 감독</span>
            <span style={{ fontSize: "34px", fontWeight: 900, marginTop: "4px" }}>{data.mvpCoach.coachKo} <span style={{ opacity: 0.6, fontSize: "24px", fontWeight: 700, marginLeft: "12px" }}>{data.mvpCoach.teamKo}</span></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontFamily: "Oswald" }}>
            <span style={{ fontSize: "34px" }}>{data.mvpCoach.row.won}승 {data.mvpCoach.row.drawn}무 {data.mvpCoach.row.lost}패</span>
            {data.mvpCoach.row.overPerf != null && <span style={{ fontSize: "22px", color: "#34d399" }}>시장 기대 대비 +{data.mvpCoach.row.overPerf.toFixed(1)}점</span>}
          </div>
        </div>
      )}

      {runners.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginTop: "28px", padding: "26px 30px", borderRadius: "20px", background: "rgba(0,0,0,0.28)" }}>
          <span style={{ fontSize: "21px", opacity: 0.6, marginBottom: "14px" }}>이번 주 다른 활약</span>
          {runners.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.08)" : "none", fontSize: "26px" }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <span style={{ fontWeight: 900 }}>{r.name}</span>
                <span style={{ opacity: 0.6 }}>{r.teamKo}</span>
              </div>
              <div style={{ display: "flex", gap: "18px", fontFamily: "Oswald" }}>
                <span style={{ color: ratingColor(r.rating) }}>{r.rating.toFixed(2)}</span>
                <span style={{ opacity: 0.8 }}>{r.goals}G {r.assists}A</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- top ----------

function TopBody({ players, logos, photo }: { players: TodPlayer[]; logos: (string | null)[]; photo: string | null }) {
  return (
    <div style={{ display: "flex", flex: 1, gap: "28px" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {players.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            <span style={{ display: "flex", width: "44px", flexShrink: 0, fontSize: "36px", fontFamily: "Oswald", opacity: i < 3 ? 1 : 0.55 }}>{i + 1}</span>
            <Logo src={logos[i]} size={40} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "27px", fontWeight: 900, lineHeight: 1.15 }}>{p.name}</span>
              <span style={{ fontSize: "18px", opacity: 0.6 }}>{p.countryKo || p.country} · {POS_KO[p.pos] ?? p.pos} · {p.goals}골 {p.assists}도움</span>
            </div>
            <span style={{ display: "flex", width: "96px", flexShrink: 0, justifyContent: "flex-end", fontSize: "40px", fontFamily: "Oswald", color: ratingColor(p.rating) }}>{p.rating.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "300px", flexShrink: 0, alignItems: "center", justifyContent: "flex-start", paddingTop: "8px" }}>
        <Avatar src={photo} size={280} ring={ratingColor(players[0]?.rating ?? 0)} />
        <span style={{ fontSize: "20px", opacity: 0.6, marginTop: "18px" }}>주간 MVP</span>
        <span style={{ fontSize: "30px", fontWeight: 900, textAlign: "center", lineHeight: 1.2, marginTop: "4px" }}>{players[0]?.name}</span>
      </div>
    </div>
  );
}

// ---------- table ----------

function TableBody({ rows, logos }: { rows: SoccerWeeklyReviewData["teams"]; logos: (string | null)[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 0 8px 0", fontSize: "18px", opacity: 0.55 }}>
        <span style={{ display: "flex", width: "44px", flexShrink: 0 }}>#</span>
        <span style={{ display: "flex", flex: 1, paddingLeft: "56px" }}>팀 · 감독</span>
        <span style={{ display: "flex", width: "150px", flexShrink: 0, justifyContent: "center" }}>승 무 패</span>
        <span style={{ display: "flex", width: "100px", flexShrink: 0, justifyContent: "center" }}>득실</span>
        <span style={{ display: "flex", width: "110px", flexShrink: 0, justifyContent: "center" }}>기대 대비</span>
        <span style={{ display: "flex", width: "90px", flexShrink: 0, justifyContent: "flex-end" }}>승점</span>
      </div>
      {rows.map((t, i) => {
        const op = t.overPerf;
        const up = op != null && op >= 0;
        return (
          <div key={t.teamId} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <span style={{ display: "flex", width: "44px", flexShrink: 0, fontSize: "34px", fontFamily: "Oswald", opacity: i < 3 ? 1 : 0.55 }}>{i + 1}</span>
            <Logo src={logos[i]} size={44} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, paddingLeft: "12px" }}>
              <span style={{ fontSize: "27px", fontWeight: 900, lineHeight: 1.15 }}>{t.teamKo}</span>
              {t.coachKo && <span style={{ fontSize: "18px", opacity: 0.6 }}>{t.coachKo}</span>}
            </div>
            <span style={{ display: "flex", width: "150px", flexShrink: 0, justifyContent: "center", fontSize: "26px", fontFamily: "Oswald", opacity: 0.85 }}>{t.won}-{t.drawn}-{t.lost}</span>
            <span style={{ display: "flex", width: "100px", flexShrink: 0, justifyContent: "center", fontSize: "26px", fontFamily: "Oswald", opacity: 0.85 }}>{t.goalsFor}:{t.goalsAgainst}</span>
            <div style={{ display: "flex", width: "110px", flexShrink: 0, justifyContent: "center", alignItems: "center", gap: "6px", fontSize: "24px", fontFamily: "Oswald" }}>
              {op == null ? (
                <span style={{ opacity: 0.4 }}>-</span>
              ) : (
                <>
                  <span style={{ color: up ? "#34d399" : "#fb7185", fontFamily: "Noto", fontSize: "18px" }}>{up ? "▲" : "▼"}</span>
                  <span style={{ color: up ? "#34d399" : "#fb7185" }}>{up ? "+" : ""}{op.toFixed(1)}</span>
                </>
              )}
            </div>
            <span style={{ display: "flex", width: "90px", flexShrink: 0, justifyContent: "flex-end", fontSize: "40px", fontFamily: "Oswald" }}>{t.points}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------- heat ----------

// 선수 페이지 HeatPitch 와 같은 램프 — 연두 → 노랑 → 주황 → 빨강.
function heatColor(t: number): string {
  const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
  const c = t < 0.3 ? mix([168, 224, 60], [252, 220, 48], t / 0.3)
    : t < 0.62 ? mix([252, 220, 48], [252, 130, 28], (t - 0.3) / 0.32)
    : mix([252, 130, 28], [226, 38, 40], (t - 0.62) / 0.38);
  return `rgba(${c[0]},${c[1]},${c[2]},${(0.35 + t * 0.55).toFixed(2)})`;
}

function HeatBody({ p, photo, heat }: { p: TodPlayer; photo: string | null; heat: MvpHeat }) {
  const PW = 968;
  const PH = 660;
  const cw = PW / SMOOTH_X;
  const ch = PH / SMOOTH_Y;
  const line = "2px solid rgba(255,255,255,0.55)";
  const ZONE_X = ["수비", "중원", "공격"];
  const zonePct = (v: number) => (heat.total ? Math.round((v / heat.total) * 100) : 0);
  const lead = heat.lanes[0] >= heat.lanes[1] && heat.lanes[0] >= heat.lanes[2] ? "왼쪽" : heat.lanes[2] >= heat.lanes[1] ? "오른쪽" : "중앙";
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "18px" }}>
        <Avatar src={photo} size={72} ring={ratingColor(p.rating)} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "34px", fontWeight: 900, lineHeight: 1.1 }}>{p.name}</span>
          <span style={{ fontSize: "20px", opacity: 0.65 }}>{p.countryKo || p.country} · {POS_KO[p.pos] ?? p.pos} · 평점 {p.rating.toFixed(2)} · {p.goals}골 {p.assists}도움</span>
        </div>
      </div>

      {/* 피치 — 공격 방향 오른쪽 */}
      <div style={{ position: "relative", display: "flex", width: PW, height: PH, borderRadius: "18px", overflow: "hidden", background: "#1c4a2a", flexShrink: 0 }}>
        {/* KDE 격자 — HeatPitch 와 같은 임계(0.28)·램프. 차가운 곳은 잔디 그대로 */}
        {heat.smooth.map((col, xi) => col.map((v, yi) => {
          if (v < 0.28) return null;
          const t = (v - 0.28) / 0.72;
          return <div key={`${xi}-${yi}`} style={{ position: "absolute", left: xi * cw, top: yi * ch, width: cw + 1, height: ch + 1, background: heatColor(t) }} />;
        }))}
        {/* 라인 */}
        <div style={{ position: "absolute", left: 18, top: 18, width: PW - 36, height: PH - 36, border: line }} />
        <div style={{ position: "absolute", left: PW / 2 - 1, top: 18, width: 2, height: PH - 36, background: "rgba(255,255,255,0.55)" }} />
        <div style={{ position: "absolute", left: PW / 2 - 70, top: PH / 2 - 70, width: 140, height: 140, borderRadius: "999px", border: line }} />
        <div style={{ position: "absolute", left: 18, top: PH / 2 - 135, width: 130, height: 270, border: line }} />
        <div style={{ position: "absolute", left: PW - 148, top: PH / 2 - 135, width: 130, height: 270, border: line }} />
        <div style={{ position: "absolute", left: 18, top: PH / 2 - 72, width: 48, height: 144, border: line }} />
        <div style={{ position: "absolute", left: PW - 66, top: PH / 2 - 72, width: 48, height: 144, border: line }} />
        {/* 3×3 존 비율 */}
        {heat.zones.map((lanes, ti) => lanes.map((v, li) => (
          <div key={`z${ti}${li}`} style={{ position: "absolute", left: (ti + 0.5) * (PW / 3) - 44, top: (li + 0.5) * (PH / 3) - 22, width: 88, height: 44, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "rgba(2,6,23,0.62)", fontSize: "26px", fontFamily: "Oswald", color: "white" }}>
            {zonePct(v)}%
          </div>
        )))}
        <div style={{ position: "absolute", right: 26, bottom: 22, display: "flex", fontSize: "18px", opacity: 0.7 }}>공격 방향 →</div>
      </div>

      {/* 3선 분포 + 요약 */}
      <div style={{ display: "flex", gap: "14px", marginTop: "22px" }}>
        {heat.thirds.map((v, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "16px 0", borderRadius: "16px", background: "rgba(255,255,255,0.08)", alignItems: "center" }}>
            <span style={{ fontSize: "18px", opacity: 0.65 }}>{ZONE_X[i]} 진영</span>
            <span style={{ fontSize: "40px", fontFamily: "Oswald", lineHeight: 1.1, marginTop: "2px" }}>{v}%</span>
          </div>
        ))}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "16px 0", borderRadius: "16px", background: "rgba(255,255,255,0.08)", alignItems: "center" }}>
          <span style={{ fontSize: "18px", opacity: 0.65 }}>터치</span>
          <span style={{ fontSize: "40px", fontFamily: "Oswald", lineHeight: 1.1, marginTop: "2px" }}>{heat.total}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1.3, padding: "16px 0", borderRadius: "16px", background: "rgba(255,255,255,0.08)", alignItems: "center" }}>
          <span style={{ fontSize: "18px", opacity: 0.65 }}>평균 위치 · 주 활동 폭</span>
          <span style={{ fontSize: "40px", fontFamily: "Oswald", lineHeight: 1.1, marginTop: "2px" }}>{Math.round(heat.avgX)}% · {lead}</span>
        </div>
      </div>
    </div>
  );
}

function Fallback({ league }: { league: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white", fontSize: 44, fontFamily: "Noto" }}>
      {LEAGUE_DISPLAY[league] ?? league} 주간 리뷰 | Scorebase
    </div>
  );
}
