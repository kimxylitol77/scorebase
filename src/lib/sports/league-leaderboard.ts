// 리그 시즌 리더보드 데이터 — leagueLeader 테이블에서 최신 시즌만 카테고리별로 묶어 반환.
// standings/[league] 가 LeagueLeaderBoard 렌더에 사용.
// (predictions/[league] 는 빅5 ts 시즌통계 덮어쓰기 분기가 있어 자체 inline 유지 — 추후 통합 후보.)
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";

export async function loadLeagueLeaderboard(
  league: string,
): Promise<{ rowsByCategory: Record<string, LeaderRow[]>; season: string }> {
  // 한 리그에 여러 시즌이 누적될 수 있어 최신 시즌만 노출 (중복 방지).
  const allRows = await prisma.leagueLeader.findMany({
    where: { league },
    orderBy: [{ season: "desc" }, { category: "asc" }, { rank: "asc" }],
    take: 400,
  });
  const season = allRows[0]?.season ?? "";
  const rowsByCategory: Record<string, LeaderRow[]> = {};
  for (const r of allRows.filter((r) => r.season === season)) {
    if (!rowsByCategory[r.category]) rowsByCategory[r.category] = [];
    rowsByCategory[r.category].push({
      rank: r.rank,
      playerName: toKoreanPlayerName(r.playerName),
      playerNameEn: r.playerNameEn ?? r.playerName,
      teamName: toKoreanTeamName(r.teamName, league),
      teamShort: r.teamShort,
      value: r.value,
      unit: r.unit,
      appearances: r.appearances,
      photoUrl: r.photoUrl,
      externalId: r.externalId,
    });
  }
  return { rowsByCategory, season };
}
