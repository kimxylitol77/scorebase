// 선수 커리어 데이터 헬퍼 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { unstable_cache } from "next/cache";
import { fetchPlayerCareer, type CareerCompRow } from "@/lib/sports/api-football-pro";
import { tsPlayerToAf } from "@/lib/players/ts-af-map";

// 경력 fetch 캐시 — 과거 시즌은 정적, 현 시즌만 변동. 하루 캐시로 quota 절약(선수당 시즌수+1 콜).
const getCachedCareer = unstable_cache(
  async (afId: number) => fetchPlayerCareer(afId),
  ["player-career-v2"], // v1 = 분당 한도로 시즌 누락된 부분 결과가 굳어 있어 폐기

  { revalidate: 86400 },
);

export type CareerCat = "league" | "cup" | "clubIntl" | "national";

export interface CareerRow {
  season: number;
  seasonLabel: string;
  compName: string;
  compFlag?: string;
  teamName: string;
  teamLogo?: string;
  appearances: number;
  goals: number;
  assists: number;
  rating: number | null;
  yellow: number;
  red: number;
}
export interface CareerGroup { cat: CareerCat; label: string; rows: CareerRow[]; total: Omit<CareerRow, "season" | "seasonLabel" | "compName" | "compFlag" | "teamName" | "teamLogo" | "rating"> & { rating: number | null } }
export const CAT_LABEL: Record<CareerCat, string> = { league: "League", cup: "Cup", clubIntl: "Continental", national: "National team" };

// 대회명 한글 (자주 나오는 것 — 미등록은 영문 그대로)
// 대회명 한국어 — 출전기록 대회 필터도 이 사전을 쓴다(사본 추가 방지).
export const COMP_KO: Record<string, string> = {}; // 영어판 — 대회명은 영문 원본을 그대로 쓴다

// 단일 연도 시즌 표기 국가(유럽식 2024/2025 대신 2024)
const CALENDAR_COUNTRIES = new Set(["Brazil", "Argentina", "USA", "Japan", "South-Korea", "South Korea", "China", "Sweden", "Norway", "Finland", "Ireland", "Iceland", "Estonia", "Latvia", "Lithuania"]);

// 대회 카테고리 분류 — league.type 우선, 이름 패턴 보조.
function classify(r: CareerCompRow): CareerCat {
  const n = r.leagueName;
  if (/(World Cup|Euro Championship|European Championship|Copa America|Nations League|Confederations|Olympic|AFC Asian Cup|Africa Cup|Gold Cup|Qualif|Qualifying|Friendlies|Sudamericano|Toulon|Maurice Revello)/i.test(n) && !/Club/i.test(n)) return "national";
  if (/^(UEFA|CONMEBOL|Concacaf Champions|AFC Champions)|Copa Libertadores|Copa Sudamericana|Club World Cup/i.test(n)) return "clubIntl";
  if (r.leagueType === "Cup" || /(Cup|Copa|Coupe|Pokal|Coppa|Trophy|Shield|Supercopa|Taça|Beker|Super Cup)/i.test(n)) return "cup";
  return "league";
}

function seasonLabel(season: number, country?: string): string {
  return country && CALENDAR_COUNTRIES.has(country) ? `${season}` : `${season}/${season + 1}`;
}

// ts player id → 경력 그룹 (af 매핑 없으면 빈 배열 → 페이지가 WIKI 시즌 폴백)
export async function getPlayerCareerByTs(tsId: string): Promise<CareerGroup[]> {
  const afId = tsPlayerToAf(tsId);
  if (!afId) return [];
  return getPlayerCareerGroups(afId);
}

export async function getPlayerCareerGroups(afId: number): Promise<CareerGroup[]> {
  const raw = await getCachedCareer(afId).catch(() => [] as CareerCompRow[]);
  if (!raw.length) return [];
  const byCat = new Map<CareerCat, CareerRow[]>();
  for (const r of raw) {
    const cat = classify(r);
    const row: CareerRow = {
      season: r.season,
      seasonLabel: seasonLabel(r.season, r.leagueCountry),
      compName: COMP_KO[r.leagueName] ?? r.leagueName,
      compFlag: r.leagueFlag,
      teamName: r.teamName,
      teamLogo: r.teamLogo,
      appearances: r.appearances,
      goals: r.goals,
      assists: r.assists,
      rating: r.rating,
      yellow: r.yellow,
      red: r.red,
    };
    const arr = byCat.get(cat) ?? [];
    arr.push(row);
    byCat.set(cat, arr);
  }
  const order: CareerCat[] = ["league", "cup", "clubIntl", "national"];
  const out: CareerGroup[] = [];
  for (const cat of order) {
    const rows = byCat.get(cat);
    if (!rows || !rows.length) continue;
    // 시즌 내림차순 → 같은 시즌 출전 많은 순
    rows.sort((a, b) => (b.season - a.season) || (b.appearances - a.appearances));
    // 합계 — 평점은 출전수 가중 평균
    let apps = 0, goals = 0, assists = 0, yellow = 0, red = 0, ratedApps = 0, ratedSum = 0;
    for (const r of rows) {
      apps += r.appearances; goals += r.goals; assists += r.assists; yellow += r.yellow; red += r.red;
      if (r.rating != null && r.appearances > 0) { ratedApps += r.appearances; ratedSum += r.rating * r.appearances; }
    }
    out.push({
      cat, label: CAT_LABEL[cat], rows,
      total: { appearances: apps, goals, assists, yellow, red, rating: ratedApps > 0 ? ratedSum / ratedApps : null },
    });
  }
  return out;
}
