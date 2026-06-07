// /predictions 인덱스 — 리그 카드 grid + 국가별 standings.
// 데이터 fetch 는 server, UI/motion 은 _view.tsx (client).
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  SPORTS,
  LEAGUE_DISPLAY,
  COUNTRY_BY_LEAGUE,
  COUNTRY_ORDER,
} from "@/lib/sports/sport-leagues";
import PredictionsView from "./_view";
import { SITE_URL } from "@/lib/site-url";
import {
  LEAGUES,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "./_data";
import {
  FIFA_RANKINGS,
  fifaCountryKo,
  fifaFlag,
  FIFA_RANKING_DATE,
} from "@/lib/sports/fifa-rankings";
import rawClubRankings from "../../../data/club-rankings.json";

// 세계 클럽 랭킹 top5 — 대시보드 FIFA 랭킹 옆 카드용 (정적 JSON)
const CLUB_RANKINGS = rawClubRankings as { rank: number; name: string; logo: string | null }[];

// b14e3e6 baseline 동일 — 둘 다 export. (force-dynamic 우선 + revalidate hint)
export const dynamic = "force-dynamic";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "리그 순위·우승 확률·득점/홈런/타율 리더보드 | 스코어베이스",
  description:
    "리그 순위, 시즌 우승·강등 확률, 그리고 득점·홈런·타율·ERA 리더보드까지 한 곳에서. 축구·야구·농구·아이스하키를 Monte Carlo 5,000회 + Elo 레이팅으로 분석합니다. EPL·라리가·K리그·KBO·MLB·NPB·NBA·NHL·LCK.",
  keywords: [
    "시즌 예측", "우승 확률", "강등 확률", "플레이오프 확률",
    "Monte Carlo 시뮬레이션", "Elo 레이팅",
    "리그 순위", "리그 리더보드", "득점왕", "도움왕", "득점 순위", "어시스트 순위",
    "EPL 순위", "라리가 순위", "라리가 득점왕",
    "홈런 순위", "타율 순위", "ERA 순위", "다승", "탈삼진", "KBO 홈런왕", "MLB 홈런",
    "NBA 득점 순위", "NBA 리바운드",
    "FIFA 랭킹", "축구 국가대표 순위",
  ],
};

// 한 league fetch — throw 면 빈 결과 반환 (전체 page 500 방지).
// 2026-05-27 /predictions 500 사고: standings-helper 의 새 baseball cache row
// 처리 중 일부 league 가 throw → Promise.all 전체 reject → 페이지 죽음.
async function safeFetchTop3(
  league: string,
): Promise<TopThreeEntry[]> {
  try {
    const rows = await getFullStandings(league);
    if (rows.length === 0) return [];
    const top3 = rows.slice(0, 3);
    const teams = await prisma.team.findMany({
      where: { id: { in: top3.map((r) => r.teamId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    return top3.map((r) => ({
      position: r.position,
      teamId: r.teamId,
      name: toKoreanTeamName(nameById.get(r.teamId) ?? `Team ${r.teamId}`, league),
      points: r.points,
    }));
  } catch (e) {
    console.warn(`[predictions] fetchTop3 fail league=${league}:`, (e as Error).message);
    return [];
  }
}

async function fetchTop3Map(): Promise<Record<string, TopThreeEntry[]>> {
  const allCodes = new Set<string>();
  for (const lg of LEAGUES) {
    if (lg.codes) for (const c of lg.codes) allCodes.add(c.code);
    else allCodes.add(lg.code);
  }
  const results = await Promise.all(
    Array.from(allCodes).map(async (league) => {
      const top3 = await safeFetchTop3(league);
      return [league, top3] as const;
    }),
  );
  return Object.fromEntries(results);
}

async function fetchCountryStandings(): Promise<CountryStandingsGroup[]> {
  const soccer = SPORTS.find((s) => s.code === "soccer");
  if (!soccer) return [];
  const skipCups = new Set([
    "FA_CUP", "EFL_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
    "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "CONCACAF_CCUP", "AFC_CUP",
  ]);
  const leagues = soccer.leagues.filter((l) => !skipCups.has(l));

  const fetched = await Promise.all(
    leagues.map(async (league) => {
      const top3 = await safeFetchTop3(league);
      return { league, top3 };
    }),
  );

  const byCountry = new Map<string, CountryStandingsGroup["leagues"]>();
  for (const f of fetched) {
    if (f.top3.length === 0) continue;
    const country = COUNTRY_BY_LEAGUE[f.league] ?? "기타";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({
      league: f.league,
      leagueDisplay: LEAGUE_DISPLAY[f.league] ?? f.league,
      top3: f.top3,
    });
  }

  const groups: CountryStandingsGroup[] = [];
  const seen = new Set<string>();
  for (const country of COUNTRY_ORDER) {
    if (byCountry.has(country)) {
      groups.push({
        country,
        leagues: byCountry.get(country)!,
      });
      seen.add(country);
    }
  }
  for (const [country, leagues] of Array.from(byCountry.entries()).sort()) {
    if (seen.has(country)) continue;
    groups.push({
      country,
      leagues,
    });
  }
  return groups;
}

// 구조화 데이터 — Dataset + BreadcrumbList + ItemList(리그별 시즌 예측). 리그 상세 색인 촉진.
const LEAGUE_LD_ITEMS = LEAGUES.flatMap((lg) => {
  const subs = lg.codes ?? [{ code: lg.code, label: lg.name }];
  return subs.map((s) => ({ code: s.code, label: lg.codes ? s.label : lg.name }));
});
const PREDICTIONS_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Dataset",
      name: "스코어베이스 시즌 우승 확률 예측",
      description:
        "19개 리그 시즌 시뮬레이션 — Monte Carlo 5,000회 + Elo 레이팅 기반 우승·플레이오프·강등 확률.",
      url: `${SITE_URL}/predictions`,
      keywords: ["시즌 우승 확률", "Monte Carlo 시뮬레이션", "Elo 레이팅 예측"],
      creator: { "@type": "Organization", name: "스코어베이스", url: SITE_URL },
      isAccessibleForFree: true,
      measurementTechnique: "Monte Carlo 시뮬레이션(5,000회) + Elo 레이팅",
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "시즌 예측", item: `${SITE_URL}/predictions` },
      ],
    },
    {
      "@type": "ItemList",
      name: "리그별 시즌 예측",
      description: "리그별 우승·플레이오프·강등 확률, 순위표, 시즌 리더보드 페이지.",
      numberOfItems: LEAGUE_LD_ITEMS.length,
      itemListElement: LEAGUE_LD_ITEMS.map((l, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: `${l.label} 시즌 예측`,
        url: `${SITE_URL}/predictions/${l.code}`,
      })),
    },
  ],
};

// FIFA 국가 랭킹 표시용 — 정적 JSON(fifa-rankings) → 한글명 + 국기 부여. 영문 canonical
// 매핑 없으면 toKoreanTeamName(국가대표 RAW)으로 2차 보강, 그래도 없으면 영문 그대로.
function buildFifaRanking(): { rank: number; name: string; flag: string }[] {
  return FIFA_RANKINGS.map((r) => ({
    rank: r.rank,
    name: fifaCountryKo(r.name) ?? toKoreanTeamName(r.name, "INTL_FRIENDLY"),
    flag: fifaFlag(r.name),
  }));
}

// 세계 클럽 랭킹 top5 — 한글 클럽명 + 로고
function buildClubRanking(): { rank: number; name: string; logo: string | null }[] {
  return CLUB_RANKINGS.slice(0, 5).map((c) => ({ rank: c.rank, name: toKoreanTeamName(c.name) || c.name, logo: c.logo }));
}

export default async function PredictionsRoot() {
  const [top3, countryGroups] = await Promise.all([
    fetchTop3Map(),
    fetchCountryStandings(),
  ]);
  const fifaRanking = buildFifaRanking();
  const clubRanking = buildClubRanking();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(PREDICTIONS_JSONLD) }}
      />
      <PredictionsView
        top3={top3}
        countryGroups={countryGroups}
        fifaRanking={fifaRanking}
        fifaDate={FIFA_RANKING_DATE}
        clubRanking={clubRanking}
      />
    </>
  );
}
