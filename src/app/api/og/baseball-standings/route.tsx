// GET /api/og/baseball-standings?league=MLB&div=NL 중부 — 야구 지구/리그 순위표 카드(이미지).
// 주간 리뷰 글 본문에 삽입하는 "보는 맛" 카드. 데이터는 우리 DB(빌더) — 숫자 100% 정확.
// 1200×760. Higgsfield 야구장 배경 + 팀 로고 + 순위표. 한글=Noto Sans KR, 숫자=Oswald.
import { ImageResponse } from "next/og";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { buildBaseballWeeklyReview, type WeeklyStanding } from "@/lib/sports/baseball/weekly-review";

export const runtime = "nodejs";

const CACHE = { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" };

const LEAGUE_LABEL: Record<string, string> = { MLB: "MLB", KBO: "KBO 리그", NPB: "일본프로야구" };
const DIV_SUB: Record<string, string> = {
  "AL 동부": "아메리칸리그 동부지구", "AL 중부": "아메리칸리그 중부지구", "AL 서부": "아메리칸리그 서부지구",
  "NL 동부": "내셔널리그 동부지구", "NL 중부": "내셔널리그 중부지구", "NL 서부": "내셔널리그 서부지구",
  "센트럴": "센트럴리그", "퍼시픽": "퍼시픽리그",
};
// 종목별 배경 (Higgsfield 생성). 야구 3리그는 baseball.
const BG_BY_LEAGUE: Record<string, string> = { MLB: "baseball", KBO: "baseball", NPB: "baseball" };

async function toDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${res.headers.get("content-type") ?? "image/png"};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

const pct = (p: number) => p.toFixed(3).replace(/^0/, "");
const GOLD = "#f5c542";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const league = sp.get("league") ?? "MLB";
  const div = sp.get("div") ?? "";
  const title = sp.get("title") ?? div ?? LEAGUE_LABEL[league] ?? league;

  const data = await buildBaseballWeeklyReview(league).catch(() => null);
  const rows: WeeklyStanding[] = data
    ? data.standings.filter((s) => (div ? s.division === div : !s.division))
    : [];

  const cwd = process.cwd();
  const [notoB, notoBlack, oswaldS, oswaldB] = await Promise.all([
    readFile(join(cwd, "public/fonts/NotoSansKR-Bold.ttf")),
    readFile(join(cwd, "public/fonts/NotoSansKR-Black.ttf")),
    readFile(join(cwd, "public/fonts/Oswald-SemiBold.ttf")),
    readFile(join(cwd, "public/fonts/Oswald-Bold.ttf")),
  ]);
  const fonts = [
    { name: "Noto", data: notoB, weight: 700 as const, style: "normal" as const },
    { name: "Noto", data: notoBlack, weight: 900 as const, style: "normal" as const },
    { name: "Oswald", data: oswaldS, weight: 600 as const, style: "normal" as const },
    { name: "Oswald", data: oswaldB, weight: 700 as const, style: "normal" as const },
  ];

  if (rows.length === 0) {
    return new ImageResponse(<Fallback t={title} />, { width: 1200, height: 760, fonts });
  }

  const teams = await prisma.team.findMany({ where: { league }, select: { name: true, logoUrl: true } });
  const logoUrlFor = (shortKo: string): string | null => {
    const hit = teams.find((t) => {
      const ko = toKoreanTeamName(t.name, league);
      return ko === shortKo || ko.includes(shortKo) || shortKo.includes(ko);
    });
    return hit?.logoUrl ?? null;
  };
  const logos = await Promise.all(rows.map((r) => toDataUri(logoUrlFor(r.team))));

  const bgFile = BG_BY_LEAGUE[league] ?? "baseball";
  const bgBuf = await readFile(join(cwd, `public/bg/${bgFile}.png`)).catch(() => null);
  const bg = bgBuf ? `data:image/png;base64,${bgBuf.toString("base64")}` : null;

  return new ImageResponse(
    <Card title={title} sub={DIV_SUB[div] ?? LEAGUE_LABEL[league] ?? league} league={league} rows={rows} logos={logos} bg={bg} />,
    { width: 1200, height: 760, headers: CACHE, fonts },
  );
}

// 컬럼 폭 — 팀 칸은 flex, 숫자 칸 고정
const W = { rank: "104px", wl: "196px", pct: "160px", gb: "150px", wk: "150px" };

function Card({
  title, sub, league, rows, logos, bg,
}: {
  title: string; sub: string; league: string; rows: WeeklyStanding[]; logos: (string | null)[]; bg: string | null;
}) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", fontFamily: "Noto", color: "white" }}>
      {bg && <img src={bg} width={1200} height={760} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, display: "flex", background: "linear-gradient(105deg, rgba(3,8,22,0.94) 0%, rgba(4,10,26,0.80) 46%, rgba(3,8,20,0.62) 100%)" }} />

      <div style={{ position: "relative", display: "flex", flexDirection: "column", width: "100%", height: "100%", padding: "46px 56px 34px" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ display: "flex", fontFamily: "Noto", fontWeight: 900, fontSize: "72px", letterSpacing: "-0.01em", lineHeight: 1 }}>{title}</span>
            <span style={{ display: "flex", fontFamily: "Oswald", fontWeight: 700, fontSize: "24px", color: "#0b1120", background: GOLD, padding: "5px 16px", borderRadius: "8px", letterSpacing: "0.06em", marginTop: "6px" }}>{LEAGUE_LABEL[league] ?? league}</span>
          </div>
          <span style={{ display: "flex", marginTop: "10px", fontSize: "25px", fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{sub} 순위</span>
        </div>

        {/* 컬럼 헤더 */}
        <div style={{ display: "flex", alignItems: "center", padding: "0 8px 10px", fontSize: "21px", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.03em" }}>
          <span style={{ display: "flex", width: W.rank }}>순위</span>
          <span style={{ display: "flex", flex: 1 }}>팀</span>
          <span style={{ display: "flex", width: W.wl, justifyContent: "center" }}>승-패</span>
          <span style={{ display: "flex", width: W.pct, justifyContent: "center" }}>승률</span>
          <span style={{ display: "flex", width: W.gb, justifyContent: "center" }}>게임차</span>
          <span style={{ display: "flex", width: W.wk, justifyContent: "center" }}>이번 주</span>
        </div>
        <div style={{ display: "flex", height: "2px", background: "rgba(245,197,66,0.5)" }} />

        {/* 순위 행 */}
        {rows.map((r, i) => {
          const lead = i === 0;
          const c = lead ? GOLD : "white";
          const numFont = { fontFamily: "Oswald", fontWeight: 700 };
          return (
            <div key={r.team} style={{
              display: "flex", alignItems: "center", padding: "0 8px", flex: 1,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: lead ? "rgba(245,197,66,0.10)" : "transparent",
            }}>
              <span style={{ display: "flex", width: W.rank, ...numFont, fontSize: "42px", color: c }}>{r.rank}</span>
              <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "18px", minWidth: 0 }}>
                {logos[i]
                  ? <img src={logos[i]!} width={54} height={54} style={{ width: "54px", height: "54px", objectFit: "contain" }} />
                  : <div style={{ display: "flex", width: "54px", height: "54px" }} />}
                <span style={{ display: "flex", fontFamily: "Noto", fontWeight: 900, fontSize: "37px", color: c, whiteSpace: "nowrap" }}>{r.team}</span>
              </div>
              <span style={{ display: "flex", width: W.wl, justifyContent: "center", ...numFont, fontSize: "36px", color: c }}>{r.wins}-{r.losses}</span>
              <span style={{ display: "flex", width: W.pct, justifyContent: "center", ...numFont, fontSize: "36px", color: c }}>{pct(r.pct)}</span>
              <span style={{ display: "flex", width: W.gb, justifyContent: "center", ...numFont, fontSize: "36px", color: lead ? GOLD : "rgba(255,255,255,0.82)" }}>{lead ? "—" : r.gb}</span>
              <span style={{ display: "flex", width: W.wk, justifyContent: "center", ...numFont, fontSize: "36px", color: c }}>{r.weekW}-{r.weekL}</span>
            </div>
          );
        })}

        <div style={{ display: "flex", marginTop: "18px", justifyContent: "flex-end", fontFamily: "Oswald", fontSize: "20px", fontWeight: 600, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em" }}>SCOREBASE.KR</div>
      </div>
    </div>
  );
}

function Fallback({ t }: { t: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#0f172a,#1e293b)", color: "white", fontFamily: "Noto", fontSize: "52px", fontWeight: 900 }}>
      {t} 순위
    </div>
  );
}
