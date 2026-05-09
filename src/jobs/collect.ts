// 경기 데이터 수집 잡.
// 사용:
//   npm run job:collect -- --league EPL --date 2026-05-08
//   npm run job:collect -- --league EPL          (오늘)
//   npm run job:collect -- --all                 (모든 리그, 오늘)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { collectors } from "@/lib/sports";
import type { League, NormalizedMatch } from "@/lib/sports/types";

function todayKST(): string {
  // KST(UTC+9) 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function parseArgs(): { leagues: League[]; date: string } {
  const args = process.argv.slice(2);
  let date = todayKST();
  let leagues: League[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") leagues = ["KBO", "EPL", "NBA"];
    else if (args[i] === "--league") leagues = [args[++i] as League];
    else if (args[i] === "--date") date = args[++i];
  }

  if (leagues.length === 0) leagues = ["KBO", "EPL", "NBA"];
  return { leagues, date };
}

async function upsertMatch(m: NormalizedMatch) {
  const homeTeam = await prisma.team.upsert({
    where: {
      league_externalId: { league: m.league, externalId: m.homeTeam.externalId },
    },
    update: {
      name: m.homeTeam.name,
      shortName: m.homeTeam.shortName ?? null,
      logoUrl: m.homeTeam.logoUrl ?? null,
    },
    create: {
      league: m.league,
      externalId: m.homeTeam.externalId,
      name: m.homeTeam.name,
      shortName: m.homeTeam.shortName ?? null,
      logoUrl: m.homeTeam.logoUrl ?? null,
    },
  });
  const awayTeam = await prisma.team.upsert({
    where: {
      league_externalId: { league: m.league, externalId: m.awayTeam.externalId },
    },
    update: {
      name: m.awayTeam.name,
      shortName: m.awayTeam.shortName ?? null,
      logoUrl: m.awayTeam.logoUrl ?? null,
    },
    create: {
      league: m.league,
      externalId: m.awayTeam.externalId,
      name: m.awayTeam.name,
      shortName: m.awayTeam.shortName ?? null,
      logoUrl: m.awayTeam.logoUrl ?? null,
    },
  });

  await prisma.match.upsert({
    where: {
      league_externalId: { league: m.league, externalId: m.externalId },
    },
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
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeScore: m.homeScore ?? null,
      awayScore: m.awayScore ?? null,
      status: m.status,
      startTime: m.startTime,
      raw: JSON.stringify(m.raw),
    },
  });
}

export async function runCollect(opts?: { leagues?: League[]; date?: string }) {
  const argLeagues = opts?.leagues;
  const argDate = opts?.date;
  const { leagues, date } = argLeagues || argDate
    ? {
        leagues: argLeagues ?? (["KBO", "EPL", "NBA"] as League[]),
        date: argDate ?? todayKST(),
      }
    : parseArgs();
  console.log(`[collect] 시작 — leagues=${leagues.join(",")}, date=${date}`);

  for (const league of leagues) {
    try {
      const matches = await collectors[league].fetchByDate(date);
      console.log(`[collect/${league}] ${matches.length}경기 수집`);
      for (const m of matches) await upsertMatch(m);
    } catch (err) {
      console.error(`[collect/${league}] 실패:`, (err as Error).message);
    }
  }

  console.log("[collect] 완료");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCollect()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
