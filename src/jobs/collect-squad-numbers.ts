// 선수 등번호·af 세부 포지션 수집 — 빅5 리그 팀별 /players/squads → PlayerSquadInfo upsert.
// af→ts 매핑된 선수만 저장. cron: /api/cron/squad-numbers (주간 — 스쿼드는 이적창에만 바뀜).
import "@/lib/env";
import { prisma } from "@/lib/db";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import {
  API_FOOTBALL_LEAGUE_ID,
  fetchLeagueTeamIds,
  fetchTeamSquadMembers,
  getApiFootballSeason,
} from "@/lib/sports/api-football-pro";

const LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];

export async function runCollectSquadNumbers() {
  const season = getApiFootballSeason(new Date(), "EPL");
  const teamIds: number[] = [];
  for (const lg of LEAGUES) {
    teamIds.push(...(await fetchLeagueTeamIds(API_FOOTBALL_LEAGUE_ID[lg], season)));
  }

  let teams = 0;
  const rows: { id: string; number: number | null; position: string | null; afTeamId: number }[] = [];
  for (const teamId of teamIds) {
    const members = await fetchTeamSquadMembers(teamId);
    if (!members.length) continue;
    teams++;
    for (const m of members) {
      const tsId = afPlayerToTs(m.id);
      if (!tsId) continue;
      rows.push({ id: tsId, number: m.number, position: m.position, afTeamId: teamId });
    }
  }
  // upsert 를 10개 병렬 청크로 — 순차 실행은 Neon 왕복 ~2,000회로 Vercel maxDuration 을 위협
  let saved = 0;
  for (let i = 0; i < rows.length; i += 10) {
    await Promise.all(
      rows.slice(i, i + 10).map((r) =>
        prisma.playerSquadInfo.upsert({
          where: { id: r.id },
          create: r,
          update: { number: r.number, position: r.position, afTeamId: r.afTeamId },
        }),
      ),
    );
    saved += Math.min(10, rows.length - i);
  }
  return { teams, saved };
}
