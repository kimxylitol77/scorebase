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

    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const dbMatches = await prisma.match.findMany({
      where: {
        league: "NHL",
        startTime: { gte: dayStart, lte: dayEnd },
      },
      include: { homeTeam: true, awayTeam: true },
    });
    if (dbMatches.length === 0) continue;

    for (const dbm of dbMatches) {
      if (dbm.goaliesUpdatedAt && dbm.goaliesUpdatedAt > cutoff) {
        skipped++;
        continue;
      }

      const matched = schedule.find((sg) => {
        const homeOk =
          (sg.homeTeamName &&
            (normName(sg.homeTeamName).includes(normName(dbm.homeTeam.name)) ||
              normName(dbm.homeTeam.name).includes(
                normName(sg.homeTeamName),
              ))) ||
          normName(dbm.homeTeam.name).endsWith(sg.homeTeamAbbrev.toLowerCase());
        const awayOk =
          (sg.awayTeamName &&
            (normName(sg.awayTeamName).includes(normName(dbm.awayTeam.name)) ||
              normName(dbm.awayTeam.name).includes(
                normName(sg.awayTeamName),
              ))) ||
          normName(dbm.awayTeam.name).endsWith(sg.awayTeamAbbrev.toLowerCase());
        return homeOk && awayOk;
      });
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
