// 경기 데이터 수집 잡.
// 사용:
//   npm run job:collect -- --league EPL --date 2026-05-08
//   npm run job:collect -- --league EPL          (오늘)
//   npm run job:collect -- --all                 (모든 리그, 오늘)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { collectors } from "@/lib/sports";
import { fetchEplRange } from "@/lib/sports/football-data";
import type { League, NormalizedMatch } from "@/lib/sports/types";

function todayKST(): string {
  // KST(UTC+9) 기준 오늘 날짜
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(yyyymmdd: string, delta: number): string {
  const d = new Date(yyyymmdd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
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

export async function runCollect(opts?: {
  leagues?: League[];
  date?: string;
  /** 양수 N 이면 date ~ date+N 일까지 모두 fetch (미래 일정 채우기). 기본 0 = 단일 날짜. */
  futureDays?: number;
}) {
  const argLeagues = opts?.leagues;
  const argDate = opts?.date;
  const futureDays = opts?.futureDays ?? 0;
  const { leagues, date } = argLeagues || argDate
    ? {
        leagues: argLeagues ?? (["KBO", "EPL", "NBA"] as League[]),
        date: argDate ?? todayKST(),
      }
    : parseArgs();
  const endDate = futureDays > 0 ? addDays(date, futureDays) : date;
  console.log(
    `[collect] 시작 — leagues=${leagues.join(",")}, ${date}${
      futureDays > 0 ? ` ~ ${endDate} (+${futureDays}d)` : ""
    }`,
  );

  for (const league of leagues) {
    try {
      // EPL: football-data 는 dateFrom/dateTo 한 번 호출로 범위 처리 가능
      if (league === "EPL" && futureDays > 0 && process.env.FOOTBALL_DATA_KEY) {
        const matches = await fetchEplRange(date, endDate);
        console.log(`[collect/EPL] ${matches.length}경기 수집 (${date}~${endDate})`);
        for (const m of matches) await upsertMatch(m);
        continue;
      }
      // 그 외: day-loop
      let total = 0;
      for (let d = date; d <= endDate; d = addDays(d, 1)) {
        const matches = await collectors[league].fetchByDate(d);
        for (const m of matches) await upsertMatch(m);
        total += matches.length;
        if (futureDays > 0) await new Promise((r) => setTimeout(r, 80));
      }
      console.log(`[collect/${league}] ${total}경기 수집`);
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
