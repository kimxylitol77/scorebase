// KHL 예상 선발 골리 — 팀의 직전 경기 선발 골리 + 이번 시즌 기록을 Match.homeGoalie/awayGoalie 에 저장.
//
// NHL 은 공식 API 가 경기별 골리를 주지만(fetch-nhl-goalies) KHL 은 발표 소스가 없다 — ts 하키 lineup 은
// 미인가, khl.ru 는 자동 수집 금지 약관. 그래서 우리 경기 캐시(detailLive.players)로 추정한다.
//  - 예상 골리 = 그 팀의 가장 최근 종료 경기에서 가장 오래 뛴 골리 (stat 20=1 골리, 23=TOI 초)
//  - 시즌 기록 = 이번 시즌 종료 경기 누적 (24 세이브, 25 선방률 → 피유효슛 역산)
// JSON 에 projected:true 를 넣는다 — 화면은 "예상" 으로 표시하고, 골리 승률 보정(goalie-adjust)은
// NHL 에서 튜닝된 값이라 projected 는 건너뛴다(백테스트 전).

import "@/lib/env";
import { prisma } from "@/lib/db";
import { khlPlayerInfo, khlPlayerName } from "@/lib/sports/khl-players";

type Row = { id: string; stats: Array<[number, number]> };
const stat = (r: Row, k: number) => r.stats.find(([s]) => s === k)?.[1] ?? 0;

interface GoalieAcc { gp: number; saves: number; shots: number; ga: number; toi: number; wins: number; losses: number; shutouts: number }

export async function runFetchKhlGoalies(opts?: { daysAhead?: number }) {
  const days = opts?.daysAhead ?? 4;
  const now = new Date();
  const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasonStart = new Date(Date.UTC(startYear, 7, 1)); // 8/1 — KHL 9월 개막

  const finished = await prisma.match.findMany({
    where: { league: "KHL", status: "FINISHED", startTime: { gte: seasonStart }, theSportsCache: { isNot: null } },
    select: {
      startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      theSportsCache: { select: { detailLive: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const acc = new Map<string, GoalieAcc>();
  const lastStarter = new Map<number, { id: string; date: Date }>(); // teamId → 직전 경기 선발
  for (const m of finished) {
    const dl = m.theSportsCache?.detailLive as { players?: { home?: Row[]; away?: Row[] } } | null;
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? m.homeTeamId : m.awayTeamId;
      const goalies = (dl?.players?.[side] ?? []).filter((r) => r?.id && Array.isArray(r.stats) && stat(r, 20) === 1 && stat(r, 23) > 0);
      if (goalies.length === 0) continue;
      const starter = goalies.reduce((a, b) => (stat(b, 23) > stat(a, 23) ? b : a));
      lastStarter.set(teamId, { id: starter.id, date: m.startTime });
      const our = side === "home" ? m.homeScore : m.awayScore;
      const opp = side === "home" ? m.awayScore : m.homeScore;
      for (const g of goalies) {
        const saves = stat(g, 24);
        const pctRaw = stat(g, 25);
        const pct = pctRaw > 1 ? pctRaw / 100 : pctRaw;
        const shots = pct > 0 ? Math.round(saves / pct) : saves;
        const a = acc.get(g.id) ?? { gp: 0, saves: 0, shots: 0, ga: 0, toi: 0, wins: 0, losses: 0, shutouts: 0 };
        a.gp++; a.saves += saves; a.shots += shots; a.ga += shots - saves; a.toi += stat(g, 23);
        // 승패·완봉은 선발 골리에게만 (교체 골리는 기록만 누적)
        if (g === starter && our != null && opp != null) {
          if (our > opp) a.wins++; else a.losses++;
          if (opp === 0) a.shutouts++;
        }
        acc.set(g.id, a);
      }
    }
  }

  const upcoming = await prisma.match.findMany({
    where: { league: "KHL", status: "SCHEDULED", startTime: { gte: now, lte: new Date(now.getTime() + days * 86400_000) } },
    select: { id: true, homeTeamId: true, awayTeamId: true },
  });

  const goalieJson = (teamId: number): string | null => {
    const last = lastStarter.get(teamId);
    if (!last) return null;
    const a = acc.get(last.id);
    const info = khlPlayerInfo(last.id);
    return JSON.stringify({
      name: info ? khlPlayerName(info) : "이름 미확인 골리", // 사전(주간 빌드) 밖 신규 선수 — 원본 id 를 이름으로 내보내지 않는다
      pid: last.id,
      photo: info?.photo ?? null,
      league: "KHL",
      projected: true,
      lastStart: last.date.toISOString(),
      gamesPlayed: a?.gp ?? null,
      gaa: a && a.toi > 0 ? Math.round(((a.ga * 3600) / a.toi) * 100) / 100 : null,
      savePctg: a && a.shots > 0 ? Math.round((a.saves / a.shots) * 1000) / 1000 : null,
      wins: a?.wins ?? null,
      losses: a?.losses ?? null,
      shutouts: a?.shutouts ?? null,
    });
  };

  let updated = 0, missing = 0;
  for (const m of upcoming) {
    const home = goalieJson(m.homeTeamId);
    const away = goalieJson(m.awayTeamId);
    if (!home && !away) { missing++; continue; }
    await prisma.match.update({
      where: { id: m.id },
      data: { homeGoalie: home, awayGoalie: away, goaliesUpdatedAt: new Date() },
    });
    updated++;
  }
  console.log(`[khl-goalies] 완료 — 갱신 ${updated} / 골리 없음 ${missing} / 종료 ${finished.length}경기 집계`);
  return { updated, missing, finished: finished.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFetchKhlGoalies()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
