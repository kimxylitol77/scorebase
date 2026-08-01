// 리그 시즌 리더보드 데이터 — leagueLeader 테이블에서 최신 시즌만 카테고리별로 묶어 반환.
// standings/[league] 가 LeagueLeaderBoard 렌더에 사용.
// (predictions/[league] 는 빅5 ts 시즌통계 덮어쓰기 분기가 있어 자체 inline 유지 — 추후 통합 후보.)
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import type { LeaderRow } from "@/components/LeagueLeaderBoard";

// LeagueLeaderBoard 가 리그 이름만 보고 /transfers/{id} 로 링크하는 리그.
// leagueLeader 테이블의 externalId 는 api-football player id 인데 /transfers 페이지는 TheSports
// player id 만 조회 → 변환 없이 넘기면 /transfers/{afId} 가 전부 404. af→ts 로 변환해서 넘긴다.
// (변환 실패 선수는 null → 링크 비활성. predictions/[league] 는 자체 ts id 라 이 함수를 안 씀.)
const TRANSFERS_LEADER_LEAGUES = new Set(["EPL", "LALIGA", "BUNDESLIGA", "LIGUE_1", "WORLD_CUP"]);

const isAfId = (id: string) => /^\d+$/.test(id);

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
  const rows = allRows.filter((r) => r.season === season);
  const useTransfers = TRANSFERS_LEADER_LEAGUES.has(league);

  // externalId 정규화 — 컴포넌트의 링크 판정("축구 리그 + 비숫자 id = ts id → /transfers")과 짝.
  // 확장 축구 리그는 af 매핑 유무에 따라 ts id / af id 가 섞여 저장되므로 여기서 ts 로 모은다.
  // 매핑이 없으면 af id 를 그대로 둬서 /players af 뷰로 폴백 (SERIE_A·MLS·UCL 등).
  const tsCandidate = new Map<string, string>(); // 저장된 externalId → ts player id
  if (SOCCER_LEAGUES.has(league)) {
    for (const r of rows) {
      if (!r.externalId) continue;
      const ts = isAfId(r.externalId) ? afPlayerToTs(r.externalId) : r.externalId;
      if (ts) tsCandidate.set(r.externalId, ts);
    }
  }
  // /transfers 는 TheSportsPlayer 행이 있어야 렌더 → 없는 id 는 링크에서 빼 404 를 막는다.
  const liveTs = new Set<string>();
  if (tsCandidate.size > 0) {
    const found = await prisma.theSportsPlayer.findMany({
      where: { id: { in: [...new Set(tsCandidate.values())] } },
      select: { id: true },
    });
    for (const f of found) liveTs.add(f.id);
  }
  const resolveExternalId = (raw: string | null): string | null => {
    if (!raw) return null;
    const ts = tsCandidate.get(raw);
    if (ts && liveTs.has(ts)) return ts;
    // 리그 이름만으로 /transfers 로 보내는 리그는 ts 확보 실패 시 링크를 끊어야 404 를 막는다.
    return useTransfers ? null : raw;
  };

  const rowsByCategory: Record<string, LeaderRow[]> = {};
  for (const r of rows) {
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
      externalId: resolveExternalId(r.externalId),
    });
  }
  return { rowsByCategory, season };
}
