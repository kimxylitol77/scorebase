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
import {
  LEAGUES,
  type CountryStandingsGroup,
  type TopThreeEntry,
} from "./_data";

export const dynamic = "force-dynamic";
export const revalidate = 600;

export const metadata: Metadata = {
  title: "시즌 예측 — 스코어베이스",
  description:
    "19개 리그 시즌 시뮬레이션 — Monte Carlo 1,000회 기반 우승·플레이오프·강등 확률. K리그1·K리그2·J1·J2·AFC 챔스 엘리트·KBO·NPB·MLB·EPL·LCK 등.",
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

export default async function PredictionsRoot() {
  const [top3, countryGroups] = await Promise.all([
    fetchTop3Map(),
    fetchCountryStandings(),
  ]);
  return <PredictionsView top3={top3} countryGroups={countryGroups} />;
}
