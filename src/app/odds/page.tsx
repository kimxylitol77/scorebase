// 배당 흐름 — 종목(축구/야구/농구)별로 시장이 어느 쪽으로 움직이는지(line movement) 보여줌.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  SOCCER_LEAGUES,
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
} from "@/lib/sports/sport-leagues";
import OddsFlowList, { type FlowMatch, type BookRec } from "@/components/odds/OddsFlowList";
import { getFlowHitrate } from "@/lib/odds/flow-hitrate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "배당 흐름 | 스코어베이스",
  description: "축구·야구·농구 경기 배당이 시간에 따라 어느 쪽으로 움직이는지 — 시장의 흐름을 한눈에.",
};

type Sport = "soccer" | "baseball" | "basketball";
const SPORT_CFG: Record<Sport, { leagues: Set<string>; hasDraw: boolean }> = {
  soccer: { leagues: SOCCER_LEAGUES as Set<string>, hasDraw: true },
  baseball: { leagues: BASEBALL_LEAGUES as Set<string>, hasDraw: false },
  basketball: { leagues: BASKETBALL_LEAGUES as Set<string>, hasDraw: false },
};

export default async function OddsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const sp = await searchParams;
  const sport: Sport =
    sp?.sport === "baseball" || sp?.sport === "basketball" ? sp.sport : "soccer";
  const cfg = SPORT_CFG[sport];

  const rows = await prisma.match.findMany({
    where: {
      league: { in: Array.from(cfg.leagues) },
      startTime: { gt: new Date(Date.now() - 6 * 3600 * 1000) },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ startTime: "asc" }],
    take: 300,
  });

  // 배당 시계열(OddsSnapshot) 배치 조회 — 홈/무/원정 모두 비교해 실제로
  // 가장 크게 움직인 결과를 노출한다. 홈 배당만 보면 원정·무 쪽 움직임을 놓친다.
  const ids = rows.map((m) => m.id);
  const since = new Date(Date.now() - 96 * 3600 * 1000);
  const snaps = ids.length
    ? await prisma.oddsSnapshot.findMany({
        where: { matchId: { in: ids }, fetchedAt: { gte: since } },
        orderBy: { fetchedAt: "asc" },
        select: { matchId: true, fetchedAt: true, homeOdds: true, drawOdds: true, awayOdds: true },
      })
    : [];
  const byMatch = new Map<number, { t: number; home: number; draw: number | null; away: number }[]>();
  for (const s of snaps) {
    const arr = byMatch.get(s.matchId) ?? [];
    arr.push({
      t: s.fetchedAt.getTime(),
      home: s.homeOdds,
      draw: s.drawOdds,
      away: s.awayOdds,
    });
    byMatch.set(s.matchId, arr);
  }

  const matches: FlowMatch[] = rows
    .map((m) => {
      const ob = m.oddsBookmakers as { books?: BookRec[] } | null;
      const books = (ob?.books ?? []) as BookRec[];
      const kickoff = m.startTime.getTime();
      const pts = (byMatch.get(m.id) ?? []).filter((p) => p.t <= kickoff);
      const sides = [
        { key: "home" as const, label: toKoreanTeamName(m.homeTeam.name, m.league), fallback: m.oddsHome, model: m.predHome, market: m.marketHome },
        ...(cfg.hasDraw
          ? [{ key: "draw" as const, label: "무승부", fallback: m.oddsDraw, model: m.predDraw, market: m.marketDraw }]
          : []),
        { key: "away" as const, label: toKoreanTeamName(m.awayTeam.name, m.league), fallback: m.oddsAway, model: m.predAway, market: m.marketAway },
      ];
      const sideRows = sides.map((side) => {
        const points = pts
          .map((p) => p[side.key])
          .filter((value): value is number => value != null && Number.isFinite(value));
        const open = points[0] ?? null;
        const current = points[points.length - 1] ?? side.fallback ?? null;
        const deltaPct = open != null && current != null && open > 0 ? ((current - open) / open) * 100 : 0;
        return { ...side, points, open, current, deltaPct };
      });
      // 배당 하락을 우선으로, 같은 방향이면 하락 폭이 큰 결과를 선택한다.
      const movement = sideRows.sort((a, b) => a.deltaPct - b.deltaPct || Math.abs(b.deltaPct) - Math.abs(a.deltaPct))[0];
      const bestOdds = movement
        ? Math.max(
            ...books.map((b) =>
              movement.key === "home" ? b.h : movement.key === "draw" ? (b.d ?? 0) : b.a,
            ),
            0,
          ) || null
        : null;
      return {
        id: m.id,
        league: m.league,
        status: m.status,
        startTime: kickoff,
        homeKo: toKoreanTeamName(m.homeTeam.name, m.league),
        awayKo: toKoreanTeamName(m.awayTeam.name, m.league),
        homeLogo: m.homeTeam.logoUrl ?? null,
        awayLogo: m.awayTeam.logoUrl ?? null,
        movementSide: movement?.key ?? "home",
        movementLabel: movement?.label ?? toKoreanTeamName(m.homeTeam.name, m.league),
        points: movement?.points ?? [],
        // 홈·무·원정 세 결과의 시계열 전체 — 밀도를 버리지 않고 겹쳐 그리기 위함.
        series: pts.map((p) => ({ t: p.t, home: p.home, draw: p.draw, away: p.away })),
        openOdds: movement?.open ?? null,
        currentOdds: movement?.current ?? null,
        deltaPct: movement?.deltaPct ?? 0,
        bestOdds,
        modelProb: movement?.model ?? null,
        marketProb: movement?.market ?? null,
        lastUpdatedAt: pts.at(-1)?.t ?? m.marketUpdatedAt?.getTime() ?? null,
        books,
      };
    })
    .filter((m) => m.books.length > 0 || m.points.length > 0);

  matches.sort((a, b) => a.deltaPct - b.deltaPct || Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  // 흐름 통계(배당 하락 경기의 실제 승률)는 표본이 쌓인 야구만 노출.
  const hitrate = sport === "baseball" ? await getFlowHitrate(Array.from(cfg.leagues)) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <OddsFlowList matches={matches} sport={sport} hasDraw={cfg.hasDraw} hitrate={hitrate} />
    </div>
  );
}
