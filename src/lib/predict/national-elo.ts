// 국가대표 Elo 단일 출처 — 성인 국대(월드컵·친선·네이션스리그·예선 등)와 연령별·여자 대표 대회의 승률 계산용.
import { getWorldCupSeedElo } from "./world-cup-elos";
import { getFifaRank, getFifaRankWomen } from "@/lib/sports/fifa-rankings";
import { isSeniorNationalLeague, WOMEN_NATIONAL_LEAGUES, YOUTH_NATIONAL_LEAGUES } from "@/lib/sports/sport-leagues";

/**
 * 국대는 클럽 시즌 이력이 없어 calcEloTable 이 전원 1500 으로 평준화된다.
 * eloratings.net 시드(월드컵 본선국 실제 Elo) 우선, 없으면 FIFA 랭킹 환산(2050 − 250·log10 순위, 하한 1300), 둘 다 없으면 1500.
 */
export function nationalElo(name: string): number {
  const seed = getWorldCupSeedElo(name);
  if (seed != null) return seed;
  const rank = getFifaRank(name);
  if (rank != null) return rankToElo(rank);
  return 1500;
}

const rankToElo = (rank: number) => Math.max(1300, 2050 - 250 * Math.log10(rank));

// 연령별 대표는 성인 전력 순서를 따르지만 격차가 작다 — 성인 Elo 편차를 이만큼만 쓴다.
const YOUTH_SHRINK = 0.7;

/** "South Korea U23"·"Japan Women" → 국가명. */
function countryName(name: string): string {
  return name.replace(/\s+(U-?\d{2}|Women|W)$/i, "").trim();
}

/**
 * 국가 대항전 팀 Elo — 클럽식 Elo 대신 쓸 값. 국대 대회가 아니면 null(호출측이 tableElo 사용).
 * - 성인: nationalElo(시드 → FIFA 환산).
 * - 연령별: 1500 + 0.7·(성인 Elo − 1500) + 대회 자체 Elo 편차(tableElo − 1500).
 * - 여자: 여자 FIFA 랭킹 환산 + 대회 자체 Elo 편차.
 * @param tableElo 그 대회 이력으로 계산한 Elo(calcEloTable) — 연령별·여자에서 대회 성적 반영용.
 */
export function nationalEloFor(league: string, name: string, tableElo: number): number | null {
  if (isSeniorNationalLeague(league)) return nationalElo(name);
  const form = tableElo - 1500;
  if (YOUTH_NATIONAL_LEAGUES.has(league)) {
    return 1500 + YOUTH_SHRINK * (nationalElo(countryName(name)) - 1500) + form;
  }
  if (WOMEN_NATIONAL_LEAGUES.has(league)) {
    const rank = getFifaRankWomen(countryName(name));
    return (rank != null ? rankToElo(rank) : 1500) + form;
  }
  return null;
}
