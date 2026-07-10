// 배당 흐름 — 종목(축구/야구/농구)별로 시장이 어느 쪽으로 움직이는지(line movement) 보여줌.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  SOCCER_LEAGUES,
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
} from "@/lib/sports/sport-leagues";
import OddsFlowList, { type FlowMatch, type BookRec } from "@/components/odds/OddsFlowList";

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

  // 배당 시계열(OddsSnapshot) 배치 조회 — 경기별 홈 배당 흐름
  const ids = rows.map((m) => m.id);
  const since = new Date(Date.now() - 96 * 3600 * 1000);
  const snaps = ids.length
    ? await prisma.oddsSnapshot.findMany({
        where: { matchId: { in: ids }, fetchedAt: { gte: since } },
        orderBy: { fetchedAt: "asc" },
        select: { matchId: true, fetchedAt: true, homeOdds: true },
      })
    : [];
  const byMatch = new Map<number, { t: number; home: number }[]>();
  for (const s of snaps) {
    const arr = byMatch.get(s.matchId) ?? [];
    arr.push({ t: s.fetchedAt.getTime(), home: s.homeOdds });
    byMatch.set(s.matchId, arr);
  }

  const matches: FlowMatch[] = rows
    .map((m) => {
      const ob = m.oddsBookmakers as { books?: BookRec[] } | null;
      const books = (ob?.books ?? []) as BookRec[];
      const kickoff = m.startTime.getTime();
      const pts = (byMatch.get(m.id) ?? []).filter((p) => p.t <= kickoff);
      const openH = pts.length ? pts[0].home : null;
      const curH = pts.length ? pts[pts.length - 1].home : (m.oddsHome ?? null);
      const deltaPct =
        openH != null && curH != null && openH > 0 ? ((curH - openH) / openH) * 100 : 0;
      return {
        id: m.id,
        league: m.league,
        status: m.status,
        startTime: kickoff,
        homeKo: toKoreanTeamName(m.homeTeam.name, m.league),
        awayKo: toKoreanTeamName(m.awayTeam.name, m.league),
        homeLogo: m.homeTeam.logoUrl ?? null,
        awayLogo: m.awayTeam.logoUrl ?? null,
        points: pts.map((p) => p.home),
        openH,
        curH,
        deltaPct,
        books,
      };
    })
    .filter((m) => m.books.length > 0 || m.points.length > 0);

  matches.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

  return (
    <div className="mx-auto max-w-3xl px-4 py-5">
      <OddsFlowList matches={matches} sport={sport} hasDraw={cfg.hasDraw} />
    </div>
  );
}
