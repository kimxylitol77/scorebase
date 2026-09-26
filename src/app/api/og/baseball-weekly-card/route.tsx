// GET /api/og/baseball-weekly-card?league=KBO|NPB|MLB&end=YYYY-MM-DD&kind=mvp|hitters|pitchers — 야구 주간 선수 인포그래픽.
// 1080×1350. 주간 리뷰(KBO·NPB)와 MLB 주간 베스트 선수 글 본문 삽입 + 구글 이미지 색인. 수치는 getBaseballWeeklyPlayers 단일 출처.
//   mvp      — 주간 최고 타자(OPS 1위) 히어로 + 주간 최고 투수(ERA 1위)
//   hitters  — 주간 타자 TOP 10 (OPS 순 · 타율·홈런·타점)
//   pitchers — 주간 투수 TOP 8 (ERA 순 · 이닝·탈삼진·승-패-세)
// satori 주의 — 모든 컨테이너 display:flex, 고정폭 요소 flexShrink:0.
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { Frame, Avatar, Logo, StatTiles, toDataUri, fmtRange, loadCardFonts, CARD_W, CARD_H, CARD_CACHE } from "@/components/og/weekly-frame";
import { getBaseballWeeklyPlayers, type BaseballWeeklyPlayers, type WeeklyBatterRow, type WeeklyPitcherRow } from "@/lib/sports/baseball/weekly-players";

export const runtime = "nodejs";

const LEAGUE_KO: Record<string, string> = { KBO: "KBO 리그", NPB: "일본프로야구", MLB: "MLB" };
const LEAGUE_GRADIENT: Record<string, [string, string]> = {
  KBO: ["#1e3a8a", "#0f172a"],
  NPB: ["#7f1d1d", "#0f172a"],
  MLB: ["#064e3b", "#0f172a"],
};
const ACCENT = "#fbbf24";
// 로그 약칭이 Team 표시명과 포함 관계로도 안 맞는 경우만 (NPB 박스스코어 "DeNA" ↔ "요코하마 디엔에이 베이스타스")
const TEAM_ALIAS: Record<string, string> = { DeNA: "요코하마" };
const f3 = (n: number) => n.toFixed(3).replace(/^0/, "");

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const league = (sp.get("league") ?? "KBO").toUpperCase();
  const end = sp.get("end") ?? undefined;
  const kind = sp.get("kind") ?? "mvp";

  const fonts = await loadCardFonts();
  const opts = { width: CARD_W, height: CARD_H, fonts, headers: CARD_CACHE };
  const leagueKo = LEAGUE_KO[league] ?? league;
  const grad = LEAGUE_GRADIENT[league] ?? ["#1e293b", "#0f172a"];

  const data = await getBaseballWeeklyPlayers(league, end).catch(() => null);
  if (!data || (data.batters.length === 0 && data.pitchers.length === 0)) {
    return new ImageResponse(<Fallback leagueKo={leagueKo} />, { ...opts, headers: { "Cache-Control": "public, max-age=60" } });
  }

  // 팀 로고 — 로그의 짧은 팀명(KT·오릭스·한글 팀명)을 Team 표시명과 포함 관계로 매칭(순위 카드와 같은 규칙)
  const teams = await prisma.team.findMany({ where: { league }, select: { name: true, logoUrl: true } });
  const logoUrlFor = (raw: string): string | null => {
    const shortKo = TEAM_ALIAS[raw] ?? raw;
    if (!shortKo) return null;
    const hit = teams.find((t) => {
      const ko = toKoreanTeamName(t.name, league);
      return ko === shortKo || ko.includes(shortKo) || shortKo.includes(ko);
    });
    return hit?.logoUrl ?? null;
  };
  const range = fmtRange(data.from, data.to);

  if (kind === "hitters") {
    const rows = data.batters.slice(0, 10);
    const [logos, photo] = await Promise.all([Promise.all(rows.map((r) => toDataUri(logoUrlFor(r.team)))), toDataUri(rows[0]?.photo)]);
    return new ImageResponse(
      <Frame grad={grad} leagueKo={leagueKo} range={range} title={`주간 타자 TOP ${rows.length}`} sub={`OPS 순 · 규정 타수 이상 · 타율 / 홈런 / 타점`}>
        <HittersBody rows={rows} logos={logos} photo={photo} />
      </Frame>,
      opts,
    );
  }
  if (kind === "pitchers") {
    const rows = data.pitchers.slice(0, 8);
    const [logos, photo] = await Promise.all([Promise.all(rows.map((r) => toDataUri(logoUrlFor(r.team)))), toDataUri(rows[0]?.photo)]);
    return new ImageResponse(
      <Frame grad={grad} leagueKo={leagueKo} range={range} title={`주간 투수 TOP ${rows.length}`} sub={`평균자책점 순 · 규정 이닝 이상 · 이닝 / 탈삼진 / 승-패-세`}>
        <PitchersBody rows={rows} logos={logos} photo={photo} />
      </Frame>,
      opts,
    );
  }

  const b = data.batters[0] ?? null;
  const p = data.pitchers[0] ?? null;
  const [bPhoto, pPhoto, bLogo, pLogo] = await Promise.all([toDataUri(b?.photo), toDataUri(p?.photo), toDataUri(logoUrlFor(b?.team ?? "")), toDataUri(logoUrlFor(p?.team ?? ""))]);
  return new ImageResponse(
    <Frame grad={grad} leagueKo={leagueKo} range={range} title="이주의 선수" sub="주간 최고 타자(OPS 1위)와 최고 투수(평균자책점 1위)">
      <MvpBody data={data} b={b} p={p} bPhoto={bPhoto} pPhoto={pPhoto} bLogo={bLogo} pLogo={pLogo} />
    </Frame>,
    opts,
  );
}

function Rank({ i }: { i: number }) {
  return <span style={{ display: "flex", width: "44px", flexShrink: 0, fontSize: "36px", fontFamily: "Oswald", opacity: i < 3 ? 1 : 0.55 }}>{i + 1}</span>;
}

function MvpBody({ data, b, p, bPhoto, pPhoto, bLogo, pLogo }: {
  data: BaseballWeeklyPlayers; b: WeeklyBatterRow | null; p: WeeklyPitcherRow | null;
  bPhoto: string | null; pPhoto: string | null; bLogo: string | null; pLogo: string | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: "26px" }}>
      {b && (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "26px 28px", borderRadius: "24px", background: "rgba(0,0,0,0.26)" }}>
          <span style={{ fontSize: "20px", opacity: 0.65 }}>주간 최고 타자</span>
          <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "26px", marginTop: "12px" }}>
            <Avatar src={bPhoto} size={190} ring={ACCENT} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: "54px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{b.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", fontSize: "24px", fontWeight: 700 }}>
                <Logo src={bLogo} size={40} />
                <span>{b.team}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ opacity: 0.8 }}>{b.games}경기 {b.ab}타수 {b.h}안타</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", width: "100%", marginTop: "22px" }}>
            <StatTiles accent={ACCENT} items={[["OPS", f3(b.ops)], ["타율", f3(b.avg)], ["홈런", String(b.hr)], ["타점", String(b.rbi)], ["도루", String(b.sb)]]} />
          </div>
        </div>
      )}
      {p && (
        <div style={{ display: "flex", flexDirection: "column", width: "100%", padding: "26px 28px", borderRadius: "24px", background: "rgba(0,0,0,0.26)" }}>
          <span style={{ fontSize: "20px", opacity: 0.65 }}>주간 최고 투수</span>
          <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "26px", marginTop: "12px" }}>
            <Avatar src={pPhoto} size={190} ring="#34d399" />
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <span style={{ fontSize: "54px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{p.name}</span>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px", fontSize: "24px", fontWeight: 700 }}>
                <Logo src={pLogo} size={40} />
                <span>{p.team}</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ opacity: 0.8 }}>{p.wins}승 {p.losses}패 {p.saves}세이브</span>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", width: "100%", marginTop: "22px" }}>
            <StatTiles accent="#34d399" items={[["ERA", p.era.toFixed(2)], ["이닝", p.ip], ["탈삼진", String(p.so)], ["자책", String(p.er)], ["WHIP", p.whip != null ? p.whip.toFixed(2) : "-"]]} />
          </div>
        </div>
      )}
      <span style={{ display: "flex", fontSize: "18px", opacity: 0.5 }}>{data.league === "MLB" ? "MLB Stats API 주간 스플릿" : "경기별 박스스코어 합산"} · 규정 타수·이닝 이상</span>
    </div>
  );
}

function HittersBody({ rows, logos, photo }: { rows: WeeklyBatterRow[]; logos: (string | null)[]; photo: string | null }) {
  return (
    <div style={{ display: "flex", flex: 1, gap: "28px" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {rows.map((r, i) => (
          <div key={r.id + i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            <Rank i={i} />
            <Logo src={logos[i]} size={40} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "27px", fontWeight: 900, lineHeight: 1.15 }}>{r.name}</span>
              <span style={{ fontSize: "18px", opacity: 0.6 }}>{r.team} · {r.games}경기 · 타율 {f3(r.avg)} · {r.hr}홈런 {r.rbi}타점</span>
            </div>
            <span style={{ display: "flex", width: "110px", flexShrink: 0, justifyContent: "flex-end", fontSize: "40px", fontFamily: "Oswald", color: i === 0 ? ACCENT : "white" }}>{f3(r.ops)}</span>
          </div>
        ))}
        <span style={{ display: "flex", justifyContent: "flex-end", fontSize: "16px", opacity: 0.5, marginTop: "8px" }}>오른쪽 숫자 = OPS</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "300px", flexShrink: 0, alignItems: "center", paddingTop: "8px" }}>
        <Avatar src={photo} size={280} ring={ACCENT} />
        <span style={{ fontSize: "20px", opacity: 0.6, marginTop: "18px" }}>주간 최고 타자</span>
        <span style={{ fontSize: "30px", fontWeight: 900, textAlign: "center", lineHeight: 1.2, marginTop: "4px" }}>{rows[0]?.name}</span>
      </div>
    </div>
  );
}

function PitchersBody({ rows, logos, photo }: { rows: WeeklyPitcherRow[]; logos: (string | null)[]; photo: string | null }) {
  return (
    <div style={{ display: "flex", flex: 1, gap: "28px" }}>
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {rows.map((r, i) => (
          <div key={r.id + i} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            <Rank i={i} />
            <Logo src={logos[i]} size={40} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: "27px", fontWeight: 900, lineHeight: 1.15 }}>{r.name}</span>
              <span style={{ fontSize: "18px", opacity: 0.6 }}>{r.team} · {r.ip}이닝 · {r.so}탈삼진 · {r.wins}승 {r.losses}패 {r.saves}세</span>
            </div>
            <span style={{ display: "flex", width: "110px", flexShrink: 0, justifyContent: "flex-end", fontSize: "40px", fontFamily: "Oswald", color: i === 0 ? "#34d399" : "white" }}>{r.era.toFixed(2)}</span>
          </div>
        ))}
        <span style={{ display: "flex", justifyContent: "flex-end", fontSize: "16px", opacity: 0.5, marginTop: "8px" }}>오른쪽 숫자 = 평균자책점</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", width: "300px", flexShrink: 0, alignItems: "center", paddingTop: "8px" }}>
        <Avatar src={photo} size={280} ring="#34d399" />
        <span style={{ fontSize: "20px", opacity: 0.6, marginTop: "18px" }}>주간 최고 투수</span>
        <span style={{ fontSize: "30px", fontWeight: 900, textAlign: "center", lineHeight: 1.2, marginTop: "4px" }}>{rows[0]?.name}</span>
      </div>
    </div>
  );
}

function Fallback({ leagueKo }: { leagueKo: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white", fontSize: 44, fontFamily: "Noto" }}>
      {leagueKo} 주간 선수 | Scorebase
    </div>
  );
}
