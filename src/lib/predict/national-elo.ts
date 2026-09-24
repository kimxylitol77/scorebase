// 국가대표 Elo 단일 출처 — 성인 국대 대회(월드컵·친선·네이션스리그·예선 등)의 승률 계산용.
import { getWorldCupSeedElo } from "./world-cup-elos";
import { getFifaRank } from "@/lib/sports/fifa-rankings";

/**
 * 국대는 클럽 시즌 이력이 없어 calcEloTable 이 전원 1500 으로 평준화된다.
 * eloratings.net 시드(월드컵 본선국 실제 Elo) 우선, 없으면 FIFA 랭킹 환산(2050 − 250·log10 순위, 하한 1300), 둘 다 없으면 1500.
 */
export function nationalElo(name: string): number {
  const seed = getWorldCupSeedElo(name);
  if (seed != null) return seed;
  const rank = getFifaRank(name);
  if (rank != null) return Math.max(1300, 2050 - 250 * Math.log10(rank));
  return 1500;
}
