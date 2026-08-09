// 축구 득점왕·도움왕 과거 시즌 소급 백필 — api-football topscorers/topassists.
// LeagueLeader 는 시즌이 키에 포함돼 과거 시즌 행이 그대로 역사가 된다 (위키형 축적 3단계).
//
//   npx tsx --env-file=.env.local scripts/backfill-league-leaders.ts            # 2020~2024 전 대상 리그
//   npx tsx --env-file=.env.local scripts/backfill-league-leaders.ts 2023 EPL   # 특정 시즌·리그
//
// 멱등: 이미 그 (league, season) 에 GOAL 리더가 있으면 skip. af 분당 한도 429 시 70초 대기 후 재실행.
// 커버리지 <5 명이면 저장하지 않음 (부분 데이터로 역사 오염 방지 — fetch-league-leaders 와 동일 원칙).

import { prisma } from "../src/lib/db";
import { fetchSeasonTopScorers, fetchTopAssists } from "../src/lib/sports/api-football-pro";
import { seasonLabelFor } from "../src/lib/sports/season-calendar";
import { toKoreanTeamName } from "../src/lib/team-names";
import { toKoreanPlayerName } from "../src/lib/player-names";

// 사용자 방문이 있는 주요 리그만 — 시즌당 리그×2콜.
const LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA",
  "K_LEAGUE_1", "J1_LEAGUE", "MLS", "BRASILEIRAO", "SAUDI_PL",
];
const SEASONS = [2024, 2023, 2022, 2021, 2020];
const TOP_N = 10;

async function saveCategory(
  league: string,
  seasonLabel: string,
  category: "GOAL" | "ASSIST",
  unit: string,
  rows: Array<{ playerId: number; playerName: string; photoUrl?: string; teamName: string; value: number; appearances: number }>,
): Promise<number> {
  const top = rows.slice(0, TOP_N);
  if (top.length < 5) return 0; // 커버리지 부족 — 저장 안 함
  for (let i = 0; i < top.length; i++) {
    const p = top[i];
    await prisma.leagueLeader.upsert({
      where: { league_category_rank_season: { league, category, rank: i + 1, season: seasonLabel } },
      create: {
        league, category, rank: i + 1, season: seasonLabel,
        playerName: toKoreanPlayerName(p.playerName) || p.playerName,
        playerNameEn: p.playerName,
        externalId: p.playerId ? String(p.playerId) : null,
        teamName: toKoreanTeamName(p.teamName, league) || p.teamName,
        value: p.value, unit, appearances: p.appearances, photoUrl: p.photoUrl ?? null,
      },
      update: {}, // 백필은 기존 행을 덮지 않는다 (운영 잡 산출 보호)
    });
  }
  return top.length;
}

async function main() {
  const onlySeason = process.argv[2] ? Number(process.argv[2]) : null;
  const onlyLeague = process.argv[3] || null;
  const seasons = onlySeason ? [onlySeason] : SEASONS;
  const leagues = onlyLeague ? [onlyLeague] : LEAGUES;
  const out = { saved: 0, exists: 0, thin: 0, failed: [] as string[] };

  for (const season of seasons) {
    for (const league of leagues) {
      const label = seasonLabelFor(league, season);
      try {
        const existing = await prisma.leagueLeader.count({
          where: { league, season: label, category: "GOAL" },
        });
        if (existing > 0) { out.exists++; continue; }

        const scorers = await fetchSeasonTopScorers(league, season);
        const nG = await saveCategory(league, label, "GOAL", "득점",
          scorers.map((s) => ({ ...s, value: s.goals })));
        await new Promise((r) => setTimeout(r, 300));
        const assists = await fetchTopAssists(league, season);
        const nA = await saveCategory(league, label, "ASSIST", "도움", assists);
        await new Promise((r) => setTimeout(r, 300));

        if (nG === 0 && nA === 0) { out.thin++; continue; }
        console.log(`${league} ${label}: 득점 ${nG} · 도움 ${nA}`);
        out.saved++;
      } catch (e) {
        out.failed.push(`${league} ${label}(${(e as Error).message.slice(0, 50)})`);
      }
    }
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
