// NHL 시작 골리 매일 갱신 잡.
//
// 흐름:
//  1) 향후 N일(기본 4일) NHL 매치를 DB 에서 가져옴
//  2) 같은 날짜의 NHL Stats API schedule 호출 → game ID 매핑 (팀 abbrev/name 비교)
//  3) game-center landing 으로 양 팀 best goalie + 시즌 통계 fetch
//  4) DB Match.homeGoalie / awayGoalie 에 JSON 저장

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchNhlScheduleByDate,
  fetchGameGoalies,
  type NhlScheduledGame,
} from "@/lib/sports/nhl-api";

function daysAhead(start: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** 같은 경기로 볼 시작 시각 차이 — 일정 변경 여유. 같은 두 팀이 12시간 안에 두 번 붙지는 않는다. */
const MATCH_WINDOW_MS = 12 * 3600_000;

const teamOk = (dbName: string, name: string | undefined, abbrev: string) =>
  (!!name && (normName(name).includes(normName(dbName)) || normName(dbName).includes(normName(name)))) ||
  normName(dbName).endsWith(abbrev.toLowerCase());

/** DB 경기 ↔ NHL 일정 경기 — 두 팀 이름 + 시작 시각 12시간 이내. */
export function findScheduledGame(
  dbm: { startTime: Date; homeTeam: { name: string }; awayTeam: { name: string } },
  schedule: NhlScheduledGame[],
): NhlScheduledGame | undefined {
  return schedule.find(
    (sg) =>
      Math.abs(Date.parse(sg.startTimeUTC) - dbm.startTime.getTime()) < MATCH_WINDOW_MS &&
      teamOk(dbm.homeTeam.name, sg.homeTeamName, sg.homeTeamAbbrev) &&
      teamOk(dbm.awayTeam.name, sg.awayTeamName, sg.awayTeamAbbrev),
  );
}

export async function runFetchNhlGoalies(opts?: {
  daysAhead?: number;
  refreshHours?: number;
}) {
  const days = opts?.daysAhead ?? 4;
  const refreshHours = opts?.refreshHours ?? 24;
  console.log(
    `[nhl-goalies] 시작 — 향후 ${days}일, refresh ${refreshHours}h`,
  );

  const today = new Date();
  const dates = daysAhead(today, days);
  const cutoff = new Date(Date.now() - refreshHours * 60 * 60 * 1000);

  let updated = 0;
  let skipped = 0;
  let noGoalie = 0;

  for (const date of dates) {
    let schedule;
    try {
      schedule = await fetchNhlScheduleByDate(date);
    } catch (e) {
      console.warn(
        `[nhl-goalies] ${date} schedule 실패:`,
        (e as Error).message,
      );
      continue;
    }
    if (schedule.length === 0) continue;

    // DB 창은 일정 경기의 실제 시작 시각으로 잡는다. 일정 날짜는 미국 현지 날짜라 서부 경기(현지 밤 = UTC 다음날 새벽)가
    //  UTC 하루 창에서 빠져 골리가 영영 안 붙었다(2026-09-30 실측: 9/25~10/3 NHL 42경기 중 21경기 골리 없음 → 예측 저장 8경기).
    const times = schedule.map((sg) => Date.parse(sg.startTimeUTC)).filter(Number.isFinite);
    if (times.length === 0) continue;
    const dbMatches = await prisma.match.findMany({
      where: {
        league: "NHL",
        startTime: { gte: new Date(Math.min(...times) - MATCH_WINDOW_MS), lte: new Date(Math.max(...times) + MATCH_WINDOW_MS) },
      },
      include: { homeTeam: true, awayTeam: true },
    });
    if (dbMatches.length === 0) continue;

    for (const dbm of dbMatches) {
      if (dbm.goaliesUpdatedAt && dbm.goaliesUpdatedAt > cutoff) {
        skipped++;
        continue;
      }

      const matched = findScheduledGame(dbm, schedule);
      if (!matched) continue;

      const goalies = await fetchGameGoalies(matched.gamePk);
      if (!goalies || (!goalies.home && !goalies.away)) {
        noGoalie++;
        continue;
      }

      await prisma.match.update({
        where: { id: dbm.id },
        data: {
          homeGoalie: goalies.home ? JSON.stringify(goalies.home) : null,
          awayGoalie: goalies.away ? JSON.stringify(goalies.away) : null,
          goaliesUpdatedAt: new Date(),
        },
      });
      updated++;

      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log(
    `[nhl-goalies] 완료 — 갱신 ${updated} / 스킵 ${skipped} / 골리미정 ${noGoalie}`,
  );
  return { updated, skipped, noGoalie };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchNhlGoalies()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
