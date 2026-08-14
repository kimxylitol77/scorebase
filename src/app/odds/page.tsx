// 배당 흐름 — 종목(축구/야구/농구)별로 시장이 어느 쪽으로 움직이는지(line movement) 보여줌.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  SOCCER_LEAGUES,
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
} from "@/lib/sports/sport-leagues";
import OddsFlowList, { type FlowMatch, type BookRec } from "@/components/odds/OddsFlowList";
import NoVigCalculator from "@/components/odds/NoVigCalculator";
import BetmanOddsPanel from "@/components/odds/BetmanOddsPanel";
import { getFlowHitrate } from "@/lib/odds/flow-hitrate";
import { getBetmanRows } from "@/lib/odds/betman";

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

type Pt = { t: number; home: number; draw: number | null; away: number };

// 야구 전용 — TsBaseballOddsHistory(업체별 60초 cadence)를 15분 버킷으로 다운샘플해
// OddsSnapshot(2h cron)보다 훨씬 촘촘한 시계열 제공. 경기당 포인트 최다 업체 1곳을 채택
// (업체 평균은 게시 시각이 어긋나 계단 노이즈 생김). 부족하면 호출부에서 스냅샷 fallback.
async function baseballHistorySeries(ids: number[]): Promise<Map<number, Pt[]>> {
  const out = new Map<number, Pt[]>();
  if (!ids.length) return out;
  const sinceSec = Math.floor(Date.now() / 1000) - 48 * 3600;
  const rows = await prisma.$queryRaw<
    { matchId: number; companyId: string; bucket: number; h: number; a: number }[]
  >`
    SELECT "matchId", "companyId", (ts / 900) * 900 AS bucket,
           avg(v1)::float AS h, avg(v2)::float AS a
    FROM "TsBaseballOddsHistory"
    WHERE "matchId" = ANY(${ids}) AND kind = 'eu' AND ts >= ${sinceSec}
    GROUP BY 1, 2, 3
    ORDER BY 3 ASC
  `;
  // matchId → companyId → pts. 포인트 최다 업체 선택.
  const byMatch = new Map<number, Map<string, Pt[]>>();
  for (const r of rows) {
    if (!(r.h > 0) || !(r.a > 0)) continue;
    const comps = byMatch.get(r.matchId) ?? new Map<string, Pt[]>();
    const arr = comps.get(r.companyId) ?? [];
    arr.push({ t: r.bucket * 1000, home: r.h, draw: null, away: r.a });
    comps.set(r.companyId, arr);
    byMatch.set(r.matchId, comps);
  }
  for (const [matchId, comps] of byMatch) {
    let best: Pt[] = [];
    for (const arr of comps.values()) if (arr.length > best.length) best = arr;
    if (best.length >= 2) out.set(matchId, best);
  }
  return out;
}

async function buildFlowMatches(sport: Sport): Promise<FlowMatch[]> {
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
  const byMatch = new Map<number, Pt[]>();
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
  // 야구는 TheSports 업체별 히스토리(60초)가 있으면 그걸 우선 사용.
  const tsHist = sport === "baseball" ? await baseballHistorySeries(ids) : new Map<number, Pt[]>();

  const matches: FlowMatch[] = rows
    .map((m) => {
      const ob = m.oddsBookmakers as { books?: BookRec[] } | null;
      const books = (ob?.books ?? []) as BookRec[];
      const kickoff = m.startTime.getTime();
      const fromHist = tsHist.has(m.id);
      const allPts = fromHist ? tsHist.get(m.id)! : byMatch.get(m.id) ?? [];
      // tsHist 포인트의 t 는 15분 버킷 "시작" 시각 — 버킷이 킥오프를 걸치면 인플레이
      // row 가 평균에 섞여 스코어 반응이 "돈 몰림"으로 둔갑한다. 버킷 전체가 킥오프
      // 이전(t+15분 <= 킥오프)인 것만 프리매치로 취급.
      const preCut = fromHist ? kickoff - 15 * 60 * 1000 : kickoff;
      const prePts = allPts.filter((p) => p.t <= preCut);
      // LIVE 는 인플레이 구간도 그래프에 노출 (킥오프 후 스냅샷을 버리던 것 개선).
      // 단 움직임 지표(open/current/delta)는 프리매치 구간만 — 인플레이 배당은 스코어에
      // 휘둘려 "돈 몰림" 신호와 성격이 다르다.
      const pts = m.status === "LIVE" ? allPts : prePts;
      const liveFlow = m.status === "LIVE" && allPts.some((p) => p.t > kickoff);
      const sides = [
        { key: "home" as const, label: toKoreanTeamName(m.homeTeam.name, m.league), fallback: m.oddsHome, model: m.predHome, market: m.marketHome },
        ...(cfg.hasDraw
          ? [{ key: "draw" as const, label: "무승부", fallback: m.oddsDraw, model: m.predDraw, market: m.marketDraw }]
          : []),
        { key: "away" as const, label: toKoreanTeamName(m.awayTeam.name, m.league), fallback: m.oddsAway, model: m.predAway, market: m.marketAway },
      ];
      const sideRows = sides.map((side) => {
        const points = prePts
          .map((p) => p[side.key])
          .filter((value): value is number => value != null && Number.isFinite(value));
        const open = points[0] ?? null;
        const current = points[points.length - 1] ?? side.fallback ?? null;
        const deltaPct = open != null && current != null && open > 0 ? ((current - open) / open) * 100 : 0;
        return { ...side, points, open, current, deltaPct };
      });
      const outcome = (key: "home" | "draw" | "away") => {
        const side = sideRows.find((item) => item.key === key);
        return side
          ? {
              openOdds: side.open,
              currentOdds: side.current,
              deltaPct: side.deltaPct,
              sampleCount: side.points.length,
            }
          : null;
      };
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
        outcomes: {
          home: outcome("home")!,
          draw: outcome("draw"),
          away: outcome("away")!,
        },
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
        liveFlow,
        // 라인업/선발 발표 여부 — 배당 급변의 맥락("발표 직후 움직임") 배지용.
        lineupOut: m.lineupUpdatedAt != null || m.startersUpdatedAt != null,
        // BTTS·더블찬스 (컨센서스 평균) — 업체별 JSON 엔 없어 매치 레벨 값으로 표시.
        bttsYes: m.oddsBttsYes,
        bttsNo: m.oddsBttsNo,
        dc1x: m.oddsDc1X,
        dc12: m.oddsDc12,
        dcX2: m.oddsDcX2,
      };
    })
    .filter((m) => m.books.length > 0 || m.points.length > 0);

  matches.sort((a, b) => a.deltaPct - b.deltaPct || Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
  return matches;
}

// 데이터만 sport 별 120초 캐시 — 스냅샷 배치(최대 300경기×96h)가 매 요청 돌던 것 제거.
// fetch-odds cron 이 2h 주기라 120초 지연은 체감 없음. (transfers 팀옵션과 같은 처방)
function getFlowMatchesCached(sport: Sport): Promise<FlowMatch[]> {
  return unstable_cache(
    () => buildFlowMatches(sport),
    ["odds-flow-matches", sport],
    { revalidate: 120 },
  )();
}

export default async function OddsPage({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}) {
  const sp = await searchParams;
  const sport: Sport =
    sp?.sport === "baseball" || sp?.sport === "basketball" ? sp.sport : "soccer";
  const cfg = SPORT_CFG[sport];

  const matches = await getFlowMatchesCached(sport);
  // 베트맨 배당은 하루 2회 적재라 10분 캐시로 충분 (흐름 데이터와 별도 캐시 키).
  const betman = await unstable_cache(
    () => getBetmanRows(sport),
    ["odds-betman", sport],
    { revalidate: 600 },
  )();

  // 흐름 통계(배당 하락 경기의 실제 승률) — 야구(2-way) + 축구(3-way, 무승부=미적중).
  const hitrate =
    sport === "baseball"
      ? await getFlowHitrate(Array.from(cfg.leagues))
      : sport === "soccer"
        ? await getFlowHitrate(Array.from(cfg.leagues), 60, { threeWay: true })
        : null;

  return (
    <div className="mx-auto max-w-[1440px] px-3 py-5 sm:px-5">
      <OddsFlowList matches={matches} sport={sport} hasDraw={cfg.hasDraw} hitrate={hitrate} />
      <BetmanOddsPanel rows={betman} hasDraw={cfg.hasDraw} />
      <NoVigCalculator defaultMode={cfg.hasDraw ? "three" : "two"} />
    </div>
  );
}
