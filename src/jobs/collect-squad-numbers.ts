// 선수 등번호·af 세부 포지션 수집 — 팀별 /players/squads → PlayerSquadInfo upsert.
// af→ts 매핑된 선수만 저장. cron: /api/cron/squad-numbers (주간 — 스쿼드는 이적창에만 바뀜).
//
// 대상 리그 = 선수 페이지 모집단(PlayerMarketValue 보유)이 있는 리그 전부. 빅5 하드코딩이던 탓에
// MLS·사우디·K리그1 선수 1,472명이 등번호 0건이었다(2026-08-17 실측: 빅5 밖 보유 1/1472).
// 선수 페이지 헤더의 "No.N" 배지가 선수마다 있다 없다 하던 원인.
import "@/lib/env";
import { prisma } from "@/lib/db";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import {
  API_FOOTBALL_LEAGUE_ID,
  fetchLeagueTeamIds,
  fetchTeamSquadMembers,
  getApiFootballSeason,
} from "@/lib/sports/api-football-pro";

const LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  // 2026-08-17 확장 — 모집단이 있는데 빠져 있던 3개.
  "MLS", "SAUDI_PL", "K_LEAGUE_1",
];

export async function runCollectSquadNumbers() {
  const teamIds: number[] = [];
  for (const lg of LEAGUES) {
    // 시즌은 리그별로 계산한다 — MLS·K리그는 달력연도(2026), 유럽은 8월 경계(2026-27).
    // 빅5 기준 시즌을 그대로 넘기면 달력연도 리그가 빈 스쿼드를 받는다.
    const season = getApiFootballSeason(new Date(), lg);
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
