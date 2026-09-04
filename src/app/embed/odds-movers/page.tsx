// 배당 급변 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// URL: /embed/odds-movers?sport=soccer|baseball|basketball|hockey&limit=8&theme=light|dark
// /odds 흐름 뷰는 OddsSnapshot 시계열을 쓰지만, 위젯은 Match 의 오프닝 implied(openingMarket*)와
// 현재(market*) 차이만 본다 — 스냅샷 조인 없이 한 쿼리로 끝나고 "돈이 어느 쪽으로 몰렸나"는 같은 답이다.
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES, BASEBALL_LEAGUES, BASKETBALL_LEAGUES, HOCKEY_LEAGUES, LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";

export const revalidate = 300;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";
const SPORT_LEAGUES: Record<string, Set<string>> = {
  soccer: SOCCER_LEAGUES as Set<string>,
  baseball: BASEBALL_LEAGUES as Set<string>,
  basketball: BASKETBALL_LEAGUES as Set<string>,
  hockey: HOCKEY_LEAGUES as Set<string>,
};
const SPORT_LABEL: Record<string, string> = { soccer: "축구", baseball: "야구", basketball: "농구", hockey: "하키" };
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export const metadata: Metadata = {
  title: "배당 급변 위젯",
  robots: { index: false, follow: true },
};

export default async function OddsMoversEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const sport = SPORT_LEAGUES[one("sport")] ? one("sport") : "soccer";
  const limit = Math.min(Math.max(Number(one("limit")) || 8, 3), 20);
  const dark = one("theme") === "dark";
  const hasDraw = sport === "soccer";

  type Mover = { id: number; league: string; startTime: Date; home: string; away: string; side: "홈" | "무" | "원정"; from: number; to: number; delta: number };
  let movers: Mover[] = [];
  try {
    const now = Date.now();
    const ms = await prisma.match.findMany({
      where: {
        league: { in: Array.from(SPORT_LEAGUES[sport]) },
        status: "SCHEDULED",
        startTime: { gte: new Date(now), lte: new Date(now + 3 * 86400_000) },
        marketHome: { not: null },
        openingMarketHome: { not: null },
      },
      select: {
        id: true, league: true, startTime: true,
        marketHome: true, marketDraw: true, marketAway: true,
        openingMarketHome: true, openingMarketDraw: true, openingMarketAway: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      },
      take: 400,
    });
    for (const m of ms) {
      const sides: Array<["홈" | "무" | "원정", number | null, number | null]> = [
        ["홈", m.openingMarketHome, m.marketHome],
        ...(hasDraw ? [["무", m.openingMarketDraw, m.marketDraw] as ["무", number | null, number | null]] : []),
        ["원정", m.openingMarketAway, m.marketAway],
      ];
      let best: Mover | null = null;
      for (const [side, from, to] of sides) {
        if (from == null || to == null || from <= 0) continue;
        const delta = to - from;
        if (!best || Math.abs(delta) > Math.abs(best.delta)) {
          best = { id: m.id, league: m.league, startTime: m.startTime, home: toKoreanTeamName(m.homeTeam.name, m.league), away: toKoreanTeamName(m.awayTeam.name, m.league), side, from, to, delta };
        }
      }
      // 오프닝 대비 승률이 3%p 넘게 움직인 경기만 — 그 아래는 소음
      if (best && Math.abs(best.delta) >= 0.03) movers.push(best);
    }
    movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    movers = movers.slice(0, limit);
  } catch {
    // 빌드 프리렌더 중 Neon 연결 실패 대비 — 빈 목록으로 렌더.
  }

  const wrap = dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900";
  const sub = dark ? "text-neutral-400" : "text-neutral-500";
  const line = dark ? "border-neutral-800" : "border-neutral-200";
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <div className={`${wrap} min-h-screen px-3 py-3 font-sans text-[13px]`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-bold tracking-tight">{SPORT_LABEL[sport]} 배당 급변 · 향후 3일</h1>
        <a href={`${SITE_URL}/odds?sport=${sport}`} target="_blank" rel="noopener" className={`text-[11px] ${sub} hover:underline`}>
          제공: 스코어베이스 →
        </a>
      </div>
      <p className={`mb-2 text-[11px] ${sub}`}>오픈 배당 대비 시장이 보는 승률이 가장 크게 움직인 경기. 올라간 쪽이 돈이 몰린 쪽입니다.</p>
      {movers.length === 0 ? (
        <p className={`py-6 text-center ${sub}`}>3%p 이상 움직인 경기가 아직 없습니다.</p>
      ) : (
        <ul className="space-y-1">
          {movers.map((r) => {
            const up = r.delta > 0;
            return (
              <li key={r.id} className={`border-b ${line} py-1.5`}>
                <div className={`flex items-center justify-between text-[11px] ${sub}`}>
                  <span>{LEAGUE_DISPLAY[r.league] ?? r.league} · {KST.format(r.startTime)}</span>
                  <span className={`font-semibold ${up ? "text-rose-500" : "text-sky-500"}`}>
                    {r.side} {up ? "▲" : "▼"} {Math.abs(Math.round(r.delta * 100))}%p
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2 tabular-nums">
                  <span className="truncate">{r.home} vs {r.away}</span>
                  <span className="shrink-0 text-[12px]">
                    <span className={sub}>{pct(r.from)}</span>
                    <span className={`mx-1 ${sub}`}>→</span>
                    <span className="font-semibold">{pct(r.to)}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
