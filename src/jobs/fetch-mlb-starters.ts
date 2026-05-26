// MLB 선발 투수 정보 매일 갱신 잡.
//
// 흐름:
//   1) 향후 N일(기본 4일) MLB 매치를 DB 에서 가져옴
//   2) 같은 날짜의 MLB Stats API schedule 호출 — probablePitcher 매칭
//   3) 선발 투수가 잡힌 매치는 시즌 통계 (ERA/WHIP/K9/IP/W-L/손) 를 추가 fetch
//   4) DB Match.homeStarter / awayStarter 에 JSON 으로 저장
//
// 호출량: 향후 4일 × 평균 15경기 ≈ 60 schedule 응답에서 매치 추출.
// 선수당 1 API call (시즌 stats) — 매치당 최대 2명 = 120 calls. 무료 한도 충분.
// 같은 날 두 번째 호출은 다 건너뜀 (startersUpdatedAt 24h 내 skip).

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchMlbScheduleWithStarters,
  fetchPitcherStats,
  type MlbStarter,
} from "@/lib/sports/mlb-stats-api";

function daysAhead(start: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** team 이름 정규화 — 우리 DB 의 영문명과 MLB Stats API 영문명 차이 흡수 */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(the|fc|cf|club)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export async function runFetchMlbStarters(opts?: {
  daysAhead?: number;
  refreshHours?: number;
}) {
  const days = opts?.daysAhead ?? 4;
  // 24h → 6h 단축 — MLB Stats API probablePitcher 가 매치 직전 (수 시간 전)
  // 에 발표되는 케이스 많아 매번 fresh fetch 가 의미 큼. 24h 캐시는 너무 stale.
  const refreshHours = opts?.refreshHours ?? 6;
  console.log(
    `[mlb-starters] 시작 — 향후 ${days}일, refresh ${refreshHours}h`,
  );

  const today = new Date();
  const dates = daysAhead(today, days);
  const season = today.getUTCFullYear();

  const cutoff = new Date(Date.now() - refreshHours * 60 * 60 * 1000);

  let updated = 0;
  let skipped = 0;
  let noStarter = 0;

  for (const date of dates) {
    let scheduleGames;
    try {
      scheduleGames = await fetchMlbScheduleWithStarters(date);
    } catch (e) {
      console.warn(`[mlb-starters] ${date} schedule 실패:`, (e as Error).message);
      continue;
    }

    if (scheduleGames.length === 0) continue;

    // 우리 DB 의 그 날짜 MLB 매치
    const dayStart = new Date(`${date}T00:00:00.000Z`);
    const dayEnd = new Date(`${date}T23:59:59.999Z`);
    const dbMatches = await prisma.match.findMany({
      where: {
        league: "MLB",
        startTime: { gte: dayStart, lte: dayEnd },
      },
      include: { homeTeam: true, awayTeam: true },
    });
    if (dbMatches.length === 0) continue;

    for (const dbm of dbMatches) {
      // 최근 갱신했으면 스킵
      if (dbm.startersUpdatedAt && dbm.startersUpdatedAt > cutoff) {
        skipped++;
        continue;
      }

      // home/away 팀 이름 매칭
      const matched = scheduleGames.find((sg) => {
        const homeOk =
          normName(sg.homeTeamName).includes(normName(dbm.homeTeam.name)) ||
          normName(dbm.homeTeam.name).includes(normName(sg.homeTeamName));
        const awayOk =
          normName(sg.awayTeamName).includes(normName(dbm.awayTeam.name)) ||
          normName(dbm.awayTeam.name).includes(normName(sg.awayTeamName));
        return homeOk && awayOk;
      });
      if (!matched) continue;

      // 선발 투수 미정 매치는 일단 빈 값으로 저장 (재시도 표시)
      if (!matched.homeStarter && !matched.awayStarter) {
        noStarter++;
        continue;
      }

      let homeStarter: MlbStarter | undefined;
      let awayStarter: MlbStarter | undefined;
      try {
        if (matched.homeStarter) {
          const stats = await fetchPitcherStats(matched.homeStarter.pid, season);
          homeStarter = { ...matched.homeStarter, ...stats };
        }
        if (matched.awayStarter) {
          const stats = await fetchPitcherStats(matched.awayStarter.pid, season);
          awayStarter = { ...matched.awayStarter, ...stats };
        }
      } catch (e) {
        console.warn(
          `[mlb-starters] match #${dbm.id} 통계 fetch 실패:`,
          (e as Error).message,
        );
        continue;
      }

      await prisma.match.update({
        where: { id: dbm.id },
        data: {
          homeStarter: homeStarter ? JSON.stringify(homeStarter) : null,
          awayStarter: awayStarter ? JSON.stringify(awayStarter) : null,
          startersUpdatedAt: new Date(),
        },
      });
      updated++;

      // 호출 사이 짧게 sleep (rate friendliness)
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log(
    `[mlb-starters] 완료 — 갱신 ${updated} / 스킵 ${skipped} / 선발미정 ${noStarter}`,
  );
  return { updated, skipped, noStarter };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchMlbStarters()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
