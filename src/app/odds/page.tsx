// 배당 흐름 — 종목(축구/야구/농구/하키)별로 시장이 어느 쪽으로 움직이는지(line movement) 보여줌.
import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";
import { toKoreanTeamName } from "@/lib/team-names";
import { leagueLogoUrl } from "@/lib/sports/league-logos";
import { kstDayWindow } from "@/lib/threads/kst";
import {
  SOCCER_LEAGUES,
  BASEBALL_LEAGUES,
  BASKETBALL_LEAGUES,
  HOCKEY_LEAGUES,
  VOLLEYBALL_LEAGUES,
  LOL_LEAGUES,
  MMA_LEAGUES,
} from "@/lib/sports/sport-leagues";
import OddsFlowList, { type FlowMatch, type BookRec } from "@/components/odds/OddsFlowList";
import NoVigCalculator from "@/components/odds/NoVigCalculator";
import BetmanOddsPanel from "@/components/odds/BetmanOddsPanel";
import OddsSportTabs from "@/components/odds/OddsSportTabs";
import { getFlowHitrate } from "@/lib/odds/flow-hitrate";
import { getBetmanMatches, type BetmanMatch } from "@/lib/odds/betman";
import type { Metadata } from "next";
import { jsonLdScript } from "@/lib/seo/jsonld";
import { ogPageImage } from "@/lib/seo/og";
import OddsSeoSection from "@/components/odds/OddsSeoSection";
import { betmanFaq, betmanJsonLd, betmanMetadata, faqJsonLd, flowFaq, flowJsonLd, flowMetadata, type OddsSportKey } from "@/lib/odds/odds-seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// 베트맨 목록 — 메타데이터와 본문이 같은 캐시를 읽는다(회차·경기 수를 설명에 넣기 위해).
const getBetmanCached = unstable_cache(() => getBetmanMatches(600), ["odds-betman-matches", "all"], { revalidate: 600 });
const betmanDays = (rows: BetmanMatch[]) => new Set(rows.map((r) => new Date(new Date(r.gameDate).getTime() + 9 * 3600_000).toISOString().slice(0, 10))).size;

// 종목·베트맨 탭마다 제목·설명·canonical·OG 를 나눈다. 실측 숫자(흐름 적중 비율·회차·경기 수)를 설명에 박는다 — force-dynamic 이라 낡지 않는다.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ sport?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const build = (m: { title: string; description: string; keywords: string[]; canonical: string; ogTitle: string; ogSubtitle: string }): Metadata => ({
    title: m.title,
    description: m.description,
    keywords: m.keywords,
    alternates: { canonical: m.canonical },
    openGraph: { title: m.ogTitle, description: m.description, url: m.canonical, images: ogPageImage({ title: m.ogTitle, subtitle: m.ogSubtitle, tag: "배당" }) },
    twitter: { card: "summary_large_image", title: m.ogTitle, description: m.description },
  });
  if (sp?.sport === "betman") {
    const rows = await getBetmanCached().catch(() => [] as BetmanMatch[]);
    return build(betmanMetadata(rows[0]?.gmTs ?? null, rows.length, betmanDays(rows)));
  }
  const sport: Sport = sp?.sport && SPORT_KEYS.has(sp.sport) ? (sp.sport as Sport) : "soccer";
  const cfg = SPORT_CFG[sport];
  const [matches, hitrate] = await Promise.all([getFlowMatchesCached(sport).catch(() => []), flowHitrateFor(sport, cfg).catch(() => null)]);
  return build(flowMetadata(sport, hitrate, matches.length));
}

type Sport = "soccer" | "baseball" | "basketball" | "hockey" | "volleyball" | "esports" | "mma";
const SPORT_CFG: Record<Sport, { leagues: Set<string>; hasDraw: boolean }> = {
  soccer: { leagues: SOCCER_LEAGUES as Set<string>, hasDraw: true },
  baseball: { leagues: BASEBALL_LEAGUES as Set<string>, hasDraw: false },
  basketball: { leagues: BASKETBALL_LEAGUES as Set<string>, hasDraw: false },
  // 2026-09-03 — NHL·LIIGA 는 The Odds API, 나머지 유럽 하키는 TheSports 폴러(연장 포함 2-way).
  hockey: { leagues: HOCKEY_LEAGUES as Set<string>, hasDraw: false },
  // 2026-09-03 — 셋 다 데이터는 이미 쌓이고 있었는데 탭이 없어 갈 곳이 없던 종목.
  // 배구 = TheSports 폴러(ts 히스토리) · LOL = OddsPapi/Cloudbet/Pinnacle 스냅샷 · UFC = The Odds API 일 1회.
  volleyball: { leagues: VOLLEYBALL_LEAGUES as Set<string>, hasDraw: false },
  esports: { leagues: LOL_LEAGUES as Set<string>, hasDraw: false },
  mma: { leagues: MMA_LEAGUES as Set<string>, hasDraw: false },
};
const SPORT_KEYS = new Set<string>(Object.keys(SPORT_CFG));
/** ts 업체별 히스토리(15분 버킷)를 시계열로 쓰는 종목 — 나머지는 OddsSnapshot. */
const TS_HISTORY_SPORTS = new Set<Sport>(["baseball", "hockey", "volleyball"]);

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
  // 하키·배구도 같은 ts 히스토리 테이블(각 폴러, 3분 주기)을 쓴다.
  const tsHist = TS_HISTORY_SPORTS.has(sport) ? await baseballHistorySeries(ids) : new Map<number, Pt[]>();

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
        // 리그 마크 — api-football/ESPN 로고, 없으면 화면이 국기로 폴백
        leagueLogo: leagueLogoUrl(m.league),
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
  searchParams: Promise<{ sport?: string; date?: string; item?: string }>;
}) {
  const sp = await searchParams;

  // 베트맨 배당은 독립 탭 — 해외 북메이커 흐름과 데이터도 화면도 다르다.
  if (sp?.sport === "betman") {
    // 하루 2회 적재라 10분 캐시로 충분. 발매 중인 경기 전부(보통 2~3일치 100~150경기)를 날짜별로 묶어 보인다 —
    // 60건 상한이 있을 땐 내일 후반·모레 경기가 통째로 잘렸다(2026-09-12 제보: 오늘 26·내일 77·모레 40경기 중 60건만).
    const rows = await getBetmanCached();
    const round = rows[0]?.gmTs ?? null;
    const faq = betmanFaq(round, rows.length);
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {[...betmanJsonLd(), faqJsonLd(faq)].map((ld, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
        ))}
        <h1 className="text-2xl font-medium">베트맨 배당</h1>
        <OddsSportTabs sport="betman" />
        <BetmanOddsPanel matches={rows} date={sp.date} item={sp.item} />
        <OddsSeoSection
          heading="베트맨 배당 페이지 읽는 법"
          intro={[
            `베트맨(스포츠토토) 프로토 승부식은 국내에서 합법적으로 발매되는 고정 배당 투표권입니다. 이 페이지는 발매 중 경기${round ? `(${round} 회차)` : ""} ${rows.length}건의 배당과 국내 구매자 투표 분포를 하루 두 번(09:00·21:00) 수집해 오늘·내일·모레로 묶어 보여줍니다.`,
            "이 화면의 값어치는 배당 자체보다 국내 투표 분포입니다. 해외 북메이커는 배당만 주지만 베트맨은 국내 구매자가 실제로 어디에 걸었는지를 주기 때문에, 배당을 확률로 바꾼 값과 투표 비율이 벌어진 경기가 곧 여론과 시장이 다르게 보는 경기입니다. 같은 경기의 해외 배당 흐름과 우리 AI 모델 확률은 경기 상세 페이지에서 나란히 볼 수 있습니다.",
            "스코어베이스는 베팅을 중개하거나 권유하지 않으며, 배당은 시장의 예측치로서 분석·검증 대상으로만 다룹니다. 실제 구매는 합법 사업자 안에서 이용자 본인의 책임이며 만 19세 미만은 이용할 수 없습니다.",
          ]}
          faq={faq}
          links={[
            { href: "/odds?sport=soccer", label: "해외 배당 흐름" },
            { href: "/value-bets", label: "밸류 베트" },
            { href: "/predictions/accuracy", label: "수익률 보드" },
            { href: "/blog/flat-unit-roi-vs-hit-rate", label: "플랫 유닛 수익률이란" },
            { href: "/notices/site-guide", label: "가이드 페이지" },
          ]}
        />
      </div>
    );
  }

  const sport: Sport = sp?.sport && SPORT_KEYS.has(sp.sport) ? (sp.sport as Sport) : "soccer";
  const cfg = SPORT_CFG[sport];

  const [matches, hitrate] = await Promise.all([getFlowMatchesCached(sport), flowHitrateFor(sport, cfg)]);
  const faq = flowFaq(sport, hitrate);
  const meta = ODDS_META_LABEL[sport];

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      {[...flowJsonLd(sport), faqJsonLd(faq)].map((ld, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />
      ))}
      <OddsFlowList matches={matches} sport={sport} hasDraw={cfg.hasDraw} hitrate={hitrate} todayKey={kstDayWindow().dateKey} />
      <NoVigCalculator defaultMode={cfg.hasDraw ? "three" : "two"} />
      <OddsSeoSection
        heading={`${meta.label} 배당 흐름 읽는 법`}
        intro={[
          `배당 흐름은 경기 배당이 처음 공개된 값(오픈)에서 지금까지 어느 쪽으로 얼마나 움직였는지입니다. 스코어베이스는 ${meta.leagues} ${meta.label} 경기의 해외 북메이커 평균 배당을 시간순으로 기록해, 배당이 내려가는 쪽(돈이 몰리는 쪽)과 올라가는 쪽을 표와 그래프로 보여줍니다. 현재 ${matches.length}경기가 목록에 있습니다.`,
          hitrate && hitrate.hitPct != null && hitrate.total >= 30
            ? `돈이 몰린 쪽이 항상 이기지는 않습니다. 최근 ${hitrate.windowDays}일 ${hitrate.total.toLocaleString()}경기에서 배당이 1.5% 이상 내려간 쪽이 실제로 이긴 비율은 ${hitrate.hitPct.toFixed(1)}%였고, 표 위 통계에서 하락 폭별로 나눠 볼 수 있습니다. 표의 마지막 열은 그 경기에서 돈이 몰린 쪽을 우리 AI 모델도 지지하는지(AI 동의)·시장이 과열됐는지(AI 신중)를 5%p 기준으로 표시합니다.`
            : "돈이 몰린 쪽이 항상 이기지는 않습니다. 표의 마지막 열은 그 경기에서 돈이 몰린 쪽을 우리 AI 모델도 지지하는지(AI 동의)·시장이 과열됐는지(AI 신중)를 5%p 기준으로 표시합니다.",
          "스코어베이스는 베팅을 중개하거나 권유하지 않으며, 배당은 시장의 예측치로서 분석·검증 대상으로만 다룹니다. 모든 확률과 흐름 신호는 통계 모델 기반의 참고용 정보이고 경기 결과를 보장하지 않습니다.",
        ]}
        faq={faq}
        links={[
          { href: "/value-bets", label: "밸류 베트" },
          { href: "/odds?sport=betman", label: "베트맨 배당" },
          { href: "/predictions/accuracy", label: "수익률 보드" },
          { href: "/blog/flat-unit-roi-vs-hit-rate", label: "플랫 유닛 수익률이란" },
          { href: "/notices/site-guide", label: "가이드 페이지" },
        ]}
      />
    </div>
  );
}

// 흐름 통계(배당 하락 경기의 실제 승률) — 2-way 종목 전부 + 축구(3-way, 무승부=미적중). 농구는 종전대로 제외(NBA 비시즌 표본 왜곡).
function flowHitrateFor(sport: Sport, cfg: { leagues: Set<string> }) {
  return sport !== "soccer" && sport !== "basketball"
    ? getFlowHitrate(Array.from(cfg.leagues))
    : sport === "soccer"
      ? getFlowHitrate(Array.from(cfg.leagues), 60, { threeWay: true })
      : Promise.resolve(null);
}
const ODDS_META_LABEL: Record<OddsSportKey, { label: string; leagues: string }> = {
  soccer: { label: "축구", leagues: "EPL·라리가·분데스리가·세리에 A·리그 1·K리그·J리그·UCL 등 100여 리그" },
  baseball: { label: "야구", leagues: "KBO·MLB·NPB" },
  basketball: { label: "농구", leagues: "NBA·WNBA·KBL" },
  hockey: { label: "하키", leagues: "NHL·유럽 리그" },
  volleyball: { label: "배구", leagues: "V-리그·VNL·국제대회" },
  esports: { label: "LOL", leagues: "LCK·LPL·LEC·LCS" },
  mma: { label: "UFC", leagues: "UFC" },
};
