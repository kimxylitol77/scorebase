// 축구 배당 허브 — 리그별 경기 목록 + 배당업체별 배당 드롭다운(1X2/오버언더/핸디캡)
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import OddsHubList, { type OddsMatch, type BookRec } from "@/components/odds/OddsHubList";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "축구 배당 비교 | 스코어베이스",
  description: "리그별 축구 경기의 배당업체별 승무패·오버언더·핸디캡 배당을 한눈에 비교하세요.",
};

export default async function OddsPage() {
  const rows = await prisma.match.findMany({
    where: {
      league: { in: Array.from(SOCCER_LEAGUES) },
      startTime: { gt: new Date(Date.now() - 6 * 3600 * 1000) },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ startTime: "asc" }],
    take: 300,
  });

  // 배당 방향 — 오프닝 대비 현재 확률 비교. 확률 내리면(op>mk) 배당 오름(+1), 오르면 배당 내림(-1).
  const dirOf = (op: number | null, mk: number | null): -1 | 0 | 1 => {
    if (op == null || mk == null) return 0;
    const d = op - mk;
    if (Math.abs(d) < 0.008) return 0;
    return d > 0 ? 1 : -1;
  };

  const matches: OddsMatch[] = rows
    .map((m) => {
      const ob = m.oddsBookmakers as { books?: BookRec[] } | null;
      const books = (ob?.books ?? []) as BookRec[];
      return {
        id: m.id,
        league: m.league,
        status: m.status,
        startTime: m.startTime.getTime(),
        homeKo: toKoreanTeamName(m.homeTeam.name, m.league),
        awayKo: toKoreanTeamName(m.awayTeam.name, m.league),
        homeLogo: m.homeTeam.logoUrl ?? null,
        awayLogo: m.awayTeam.logoUrl ?? null,
        hs: m.homeScore,
        as: m.awayScore,
        dirH: dirOf(m.openingMarketHome, m.marketHome),
        dirA: dirOf(m.openingMarketAway, m.marketAway),
        books,
      };
    })
    .filter((m) => m.books.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-lg font-medium">축구 배당</span>
        <span className="text-xs text-neutral-400">{matches.length}경기</span>
      </div>
      <p className="mb-3 text-[11px] text-neutral-500 dark:text-neutral-400">
        경기를 누르면 배당업체별 배당이 펼쳐집니다 · 항목별 최고 배당은 초록
      </p>
      <OddsHubList matches={matches} />
    </div>
  );
}
