// 시즌/기간 백필 잡 — 처음 한 번 돌려서 DB에 과거 경기 데이터를 채운다.
// 사용:
//   npm run job:backfill                    (기본: EPL 시즌 + 기타 리그 최근 30일)
//   npm run job:backfill -- --epl-only      (EPL 시즌만)
//   npm run job:backfill -- --days 60       (기타 리그 최근 60일)
//
// EPL 은 football-data.org 의 dateFrom/dateTo 한 번 호출로 시즌 전체 가져옴 (1 req).
// 그 외 리그는 ESPN scoreboard 가 날짜 단위라서 day-loop 로 채움.

import "@/lib/env";
import { prisma } from "@/lib/db";
import { collectors, getPrimarySource } from "@/lib/sports";
import { resolveTeamId } from "@/lib/sports/team-resolver";
import { fetchEplRange } from "@/lib/sports/football-data";
import type { League, NormalizedMatch } from "@/lib/sports/types";

function todayKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(yyyymmdd: string, delta: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let eplOnly = false;
  let otherDays = 30;
  let seasonStart = "2025-08-01"; // 2025-26 시즌 시작
  let seasonEnd = todayKST();
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--epl-only") eplOnly = true;
    else if (args[i] === "--days") otherDays = parseInt(args[++i], 10);
    else if (args[i] === "--season-start") seasonStart = args[++i];
    else if (args[i] === "--season-end") seasonEnd = args[++i];
  }
  return { eplOnly, otherDays, seasonStart, seasonEnd };
}

async function upsertMatch(m: NormalizedMatch) {
  const source = getPrimarySource(m.league);
  const homeTeamId = await resolveTeamId({
    league: m.league,
    source,
    externalId: m.homeTeam.externalId,
    name: m.homeTeam.name,
    shortName: m.homeTeam.shortName ?? null,
    logoUrl: m.homeTeam.logoUrl ?? null,
  });
  const awayTeamId = await resolveTeamId({
    league: m.league,
    source,
    externalId: m.awayTeam.externalId,
    name: m.awayTeam.name,
    shortName: m.awayTeam.shortName ?? null,
    logoUrl: m.awayTeam.logoUrl ?? null,
  });
  await prisma.match.upsert({
    where: { league_externalId: { league: m.league, externalId: m.externalId } },
    update: {
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
    },
    create: {
      league: m.league,
      externalId: m.externalId,
      homeTeamId,
      awayTeamId,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
    },
  });
}

async function backfillEplSeason(start: string, end: string) {
  console.log(`[backfill/EPL] ${start} ~ ${end} 시즌 가져오는 중…`);
  const matches = await fetchEplRange(start, end);
  console.log(`[backfill/EPL] ${matches.length}경기 수집 → upsert 중`);
  let i = 0;
  for (const m of matches) {
    await upsertMatch(m);
    if (++i % 50 === 0) console.log(`  …${i}/${matches.length}`);
  }
  console.log(`[backfill/EPL] 완료 (${matches.length}경기)`);
}

async function backfillRecent(league: League, days: number) {
  const end = todayKST();
  const start = addDays(end, -days);
  console.log(`[backfill/${league}] ${start} ~ ${end} (${days}일)`);
  let total = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    try {
      const matches = await collectors[league].fetchByDate(d);
      for (const m of matches) await upsertMatch(m);
      total += matches.length;
      if (matches.length > 0) console.log(`  ${d}: ${matches.length}경기`);
      // ESPN 은 rate limit 약하지만 살짝 쉬어준다
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.error(`  ${d} 실패: ${(err as Error).message}`);
    }
  }
  console.log(`[backfill/${league}] 완료 (총 ${total}경기)`);
}

async function main() {
  const { eplOnly, otherDays, seasonStart, seasonEnd } = parseArgs();
  console.log(
    `[backfill] eplOnly=${eplOnly}, otherDays=${otherDays}, season=${seasonStart}~${seasonEnd}`,
  );

  await backfillEplSeason(seasonStart, seasonEnd);

  if (!eplOnly) {
    const otherLeagues: League[] = [
      "LALIGA",
      "BUNDESLIGA",
      "SERIE_A",
      "LIGUE_1",
      "MLS",
      "UCL",
      "NBA",
      "NHL",
      "MLB",
      "KBO",
    ];
    for (const lg of otherLeagues) {
      try {
        await backfillRecent(lg, otherDays);
      } catch (err) {
        console.error(`[backfill/${lg}] 실패:`, (err as Error).message);
      }
    }
  }

  console.log("[backfill] 모두 완료");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
