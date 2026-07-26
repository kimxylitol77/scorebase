// 국가·종목별 리그 순위 TOP 3 그리드 데이터 — /standings(전체 허브)와 /predictions(요약)가 공유.
// getFullStandings(af 우선 → ts fallback) 기반, 리그 단위 실패는 빈 배열로 격리 (페이지 500 방지).
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  SPORTS,
  LEAGUE_DISPLAY,
  COUNTRY_BY_LEAGUE,
  COUNTRY_ORDER,
} from "@/lib/sports/sport-leagues";
import { enLeagueName, enCountryName, SPORT_LABEL_EN, toEnglishTeamName } from "@/lib/i18n/en";

export interface TopThreeEntry {
  position: number;
  teamId: number;
  name: string;
  points: number;
}

export interface CountryStandingsGroup {
  country: string;
  leagues: { league: string; leagueDisplay: string; top3: TopThreeEntry[] }[];
}

// locale='en' 이면 팀명 한글 변환 skip (DB 원본이 영문) + 국가·리그명 영문.
export type StandingsLocale = "ko" | "en";

export async function safeFetchTop3(league: string, locale: StandingsLocale = "ko"): Promise<TopThreeEntry[]> {
  try {
    const rows = await getFullStandings(league);
    if (rows.length === 0) return [];
    // MLB 처럼 양 리그 합산 표는 동순위(position 중복)가 있음 — 동순위 내 승점 내림차순 보정
    const top3 = [...rows].sort((a, b) => a.position - b.position || b.points - a.points).slice(0, 3);
    const teams = await prisma.team.findMany({
      where: { id: { in: top3.map((r) => r.teamId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(teams.map((t) => [t.id, t.name]));
    return top3.map((r) => {
      const raw = nameById.get(r.teamId) ?? `Team ${r.teamId}`;
      return {
        position: r.position,
        teamId: r.teamId,
        name: locale === "en" ? toEnglishTeamName(raw) : toKoreanTeamName(raw, league),
        points: r.points,
      };
    });
  } catch (e) {
    console.warn(`[standings-overview] fetchTop3 fail league=${league}:`, (e as Error).message);
    return [];
  }
}

/** 축구 — 국가별 그룹 (컵대회 제외). */
export async function fetchSoccerCountryGroups(locale: StandingsLocale = "ko"): Promise<CountryStandingsGroup[]> {
  const soccer = SPORTS.find((s) => s.code === "soccer");
  if (!soccer) return [];
  const skipCups = new Set([
    "FA_CUP", "EFL_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
    "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "CONCACAF_CCUP", "AFC_CUP",
  ]);
  const leagues = soccer.leagues.filter((l) => !skipCups.has(l));

  const fetched = await Promise.all(
    leagues.map(async (league) => ({ league, top3: await safeFetchTop3(league, locale) })),
  );

  const byCountry = new Map<string, CountryStandingsGroup["leagues"]>();
  for (const f of fetched) {
    if (f.top3.length === 0) continue;
    const country = COUNTRY_BY_LEAGUE[f.league] ?? "기타";
    if (!byCountry.has(country)) byCountry.set(country, []);
    byCountry.get(country)!.push({
      league: f.league,
      leagueDisplay:
        locale === "en" ? enLeagueName(f.league) : (LEAGUE_DISPLAY[f.league] ?? f.league),
      top3: f.top3,
    });
  }

  const groups: CountryStandingsGroup[] = [];
  const seen = new Set<string>();
  for (const country of COUNTRY_ORDER) {
    if (byCountry.has(country)) {
      groups.push({ country, leagues: byCountry.get(country)! });
      seen.add(country);
    }
  }
  for (const [country, lgs] of Array.from(byCountry.entries()).sort()) {
    if (seen.has(country)) continue;
    groups.push({ country, leagues: lgs });
  }
  if (locale === "en") {
    return groups.map((g) => ({ ...g, country: enCountryName(g.country) }));
  }
  return groups;
}

/** 비축구 종목(야구·농구·하키 등) — 종목 단위 그룹. standings 있는 리그만 자동 노출
 *  (NBA·NHL 은 시즌오프 0행 → 미노출, 개막 후 standings 쌓이면 자동 등장).
 *  detailPageCodes 를 주면 그 리그들만 (카드 링크 404 방지). */
export async function fetchSportGroups(
  detailPageCodes?: Set<string>,
  locale: StandingsLocale = "ko",
): Promise<CountryStandingsGroup[]> {
  const groups: CountryStandingsGroup[] = [];
  for (const sport of SPORTS.filter((s) => s.code !== "soccer")) {
    const codes = sport.leagues.filter((l) => !detailPageCodes || detailPageCodes.has(l));
    if (codes.length === 0) continue;
    const fetched = await Promise.all(
      codes.map(async (league) => ({ league, top3: await safeFetchTop3(league, locale) })),
    );
    const leagues = fetched
      .filter((f) => f.top3.length > 0)
      .map((f) => ({
        league: f.league,
        leagueDisplay:
          locale === "en" ? enLeagueName(f.league) : (LEAGUE_DISPLAY[f.league] ?? f.league),
        top3: f.top3,
      }));
    const label =
      locale === "en" ? (SPORT_LABEL_EN[sport.code] ?? sport.code) : sport.label;
    if (leagues.length > 0) groups.push({ country: `${sport.emoji} ${label}`, leagues });
  }
  return groups;
}
