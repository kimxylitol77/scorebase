// 경기 데이터 수집 잡.
// 사용:
//   npm run job:collect -- --league EPL --date 2026-05-08
//   npm run job:collect -- --league EPL          (오늘)
//   npm run job:collect -- --all                 (모든 리그, 오늘)

import "@/lib/env";
import { prisma } from "@/lib/db";
import { collectors } from "@/lib/sports";
import { fetchEplRange } from "@/lib/sports/football-data";
import { fetchEspnSoccerByDate } from "@/lib/sports/espn-soccer";
import { fetchWorldCupAll } from "@/lib/sports/world-cup";
import { fetchLolLckAll } from "@/lib/sports/lol";
import type { League, NormalizedMatch } from "@/lib/sports/types";
import { runParallel } from "@/lib/utils/parallel";

const UPSERT_CONCURRENCY = 5;

// 팀 이름 정규화 — football-data 와 ESPN 의 팀명 표기 차이 흡수
// (예: "Manchester City FC" ↔ "Manchester City", "Tottenham Hotspur" ↔ "Tottenham")
function normalizeTeamName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(fc|afc|cf|club|hotspur|wanderers)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

function findEspnMatch(
  espnList: NormalizedMatch[],
  m: NormalizedMatch,
): NormalizedMatch | undefined {
  const homeN = normalizeTeamName(m.homeTeam.name);
  const awayN = normalizeTeamName(m.awayTeam.name);
  return espnList.find((e) => {
    const eh = normalizeTeamName(e.homeTeam.name);
    const ea = normalizeTeamName(e.awayTeam.name);
    return (
      (eh.includes(homeN) || homeN.includes(eh)) &&
      (ea.includes(awayN) || awayN.includes(ea))
    );
  });
}

/**
 * football-data EPL 결과를 ESPN 스코어보드와 cross-check 해서
 * 종료된 매치의 점수가 다르면 ESPN 값으로 덮어쓴다.
 * (football-data 무료 플랜 데이터 오류 사례 대응 — Liverpool vs Chelsea 1:1 → 잘못 1:2 응답한 사례)
 */
async function crossCheckEplWithEspn(
  matches: NormalizedMatch[],
): Promise<{ corrected: number }> {
  if (matches.length === 0) return { corrected: 0 };
  // 매치 날짜 unique 셋 → ESPN 한 번씩만 호출
  const dateKeys = Array.from(
    new Set(matches.map((m) => m.startTime.toISOString().slice(0, 10))),
  );
  const espnByDate = new Map<string, NormalizedMatch[]>();
  for (const d of dateKeys) {
    try {
      const espn = await fetchEspnSoccerByDate("EPL", d);
      espnByDate.set(d, espn);
    } catch (e) {
      console.warn(`[xcheck/EPL] ${d} ESPN fetch 실패:`, (e as Error).message);
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  let corrected = 0;
  for (const m of matches) {
    if (m.status !== "FINISHED") continue;
    const dateKey = m.startTime.toISOString().slice(0, 10);
    const espn = findEspnMatch(espnByDate.get(dateKey) ?? [], m);
    if (!espn || espn.status !== "FINISHED") continue;
    if (
      espn.homeScore !== m.homeScore ||
      espn.awayScore !== m.awayScore
    ) {
      console.log(
        `[xcheck/EPL] ${m.homeTeam.name} vs ${m.awayTeam.name}: football-data ${m.homeScore}:${m.awayScore} → ESPN ${espn.homeScore}:${espn.awayScore}`,
      );
      m.homeScore = espn.homeScore;
      m.awayScore = espn.awayScore;
      corrected++;
    }
  }
  return { corrected };
}

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
  /** 양수 N 이면 date-N ~ date 까지도 함께 fetch (어제 끝난 매치 score/status 보정). 기본 0. */
  pastDays?: number;
}) {
  const argLeagues = opts?.leagues;
  const argDate = opts?.date;
  const futureDays = opts?.futureDays ?? 0;
  const pastDays = opts?.pastDays ?? 0;
  const { leagues, date } = argLeagues || argDate
    ? {
        leagues: argLeagues ?? (["KBO", "EPL", "NBA"] as League[]),
        date: argDate ?? todayKST(),
      }
    : parseArgs();
  const startDate = pastDays > 0 ? addDays(date, -pastDays) : date;
  const endDate = futureDays > 0 ? addDays(date, futureDays) : date;
  const isRange = pastDays > 0 || futureDays > 0;
  console.log(
    `[collect] 시작 — leagues=${leagues.join(",")}, ${startDate}${
      isRange ? ` ~ ${endDate} (-${pastDays}d/+${futureDays}d)` : ""
    }`,
  );

  for (const league of leagues) {
    try {
      // EPL: football-data 는 dateFrom/dateTo 한 번 호출로 범위 처리 가능
      // + ESPN cross-check 로 score 오류 보정
      if (league === "EPL" && process.env.FOOTBALL_DATA_KEY) {
        const matches = isRange
          ? await fetchEplRange(startDate, endDate)
          : await collectors.EPL.fetchByDate(date);
        const { corrected } = await crossCheckEplWithEspn(matches);
        console.log(
          `[collect/EPL] ${matches.length}경기 수집 (${startDate}~${endDate})${
            corrected > 0 ? ` · ESPN 보정 ${corrected}건` : ""
          }`,
        );
        await runParallel(matches, UPSERT_CONCURRENCY, (m) => upsertMatch(m));
        continue;
      }
      // 월드컵: 토너먼트 전체를 호출 1회로 받아 upsert.
      // 6/11~7/19 한 달 일정이라 day-loop 보다 단발 호출이 훨씬 효율적이다.
      if (league === "WORLD_CUP") {
        const matches = await fetchWorldCupAll();
        console.log(`[collect/WORLD_CUP] ${matches.length}경기 수집 (전체)`);
        await runParallel(matches, UPSERT_CONCURRENCY, (m) => upsertMatch(m));
        continue;
      }
      // LoL/LCK: BALLDONTLIE LoL endpoint 가 날짜 필터를 지원하지 않아
      // LCK tournament 전체를 한 번에 가져오는 게 효율적이다.
      if (league === "LOL") {
        const matches = await fetchLolLckAll();
        console.log(`[collect/LOL] ${matches.length}경기 수집 (LCK 전체)`);
        for (const m of matches) await upsertMatch(m);
        continue;
      }
      // 그 외: day-loop
      let total = 0;
      for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
        const matches = await collectors[league].fetchByDate(d);
        await runParallel(matches, UPSERT_CONCURRENCY, (m) => upsertMatch(m));
        total += matches.length;
        if (isRange) await new Promise((r) => setTimeout(r, 80));
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
