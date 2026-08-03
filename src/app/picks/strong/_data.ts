// /picks/strong 데이터 — 고확신 픽 목록 + 그 기준의 실제 성적.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  selectStrongPicks,
  STRONG_THRESHOLD,
  type StrongPick,
} from "@/lib/predict/strong-picks";

/** 예정 경기를 몇 시간 앞까지 볼지 — 예측 잡이 72h 창을 채우므로 그에 맞춘다 */
const WINDOW_HOURS = 72;

export interface StrongPickMatch {
  matchId: number;
  league: string;
  startTime: Date;
  home: string;
  away: string;
  picks: StrongPick[];
}

export async function loadStrongPicks(): Promise<StrongPickMatch[]> {
  const now = new Date();
  const rows = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + WINDOW_HOURS * 3600_000) },
      // 어느 마켓이든 기준을 넘을 가능성이 있는 것만 — 최저 임계로 1차 거른다
      OR: [
        { predHcProb: { gte: STRONG_THRESHOLD.HANDICAP } },
        { predDcProb: { gte: STRONG_THRESHOLD.DOUBLE_CHANCE } },
        { predHome: { gte: STRONG_THRESHOLD["1X2"] } },
        { predAway: { gte: STRONG_THRESHOLD["1X2"] } },
        { predDraw: { gte: STRONG_THRESHOLD["1X2"] } },
        { predOverProb: { gte: STRONG_THRESHOLD.OVER_UNDER } },
        { predOverProb: { lte: 1 - STRONG_THRESHOLD.OVER_UNDER } },
      ],
    },
    select: {
      id: true, league: true, startTime: true,
      predHome: true, predDraw: true, predAway: true, predWinner: true,
      predHcPick: true, predHcProb: true, predHcLine: true,
      predOverPick: true, predOverProb: true,
      predDcPick: true, predDcProb: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });

  const out: StrongPickMatch[] = [];
  for (const m of rows) {
    const home = toKoreanTeamName(m.homeTeam?.name ?? "", m.league) || (m.homeTeam?.name ?? "");
    const away = toKoreanTeamName(m.awayTeam?.name ?? "", m.league) || (m.awayTeam?.name ?? "");
    const picks = selectStrongPicks(m, home, away);
    if (!picks.length) continue; // 1차 필터를 통과했어도 실제 기준 미달일 수 있다
    out.push({ matchId: m.id, league: m.league, startTime: m.startTime, home, away, picks });
  }
  return out;
}

export interface StrongAccuracy {
  total: number;
  hit: number;
  rate: number;
}

/**
 * 이 기준의 실제 성적 — 화면에 "근거"로 내보내는 수치라 반드시 DB 실측이어야 한다.
 * 마켓별 count 두 번씩(전체·적중)이라 전수 스캔보다 가볍다.
 */
export async function loadStrongAccuracy(): Promise<StrongAccuracy> {
  const hcWhere = { predHcCorrect: { not: null }, predHcProb: { gte: STRONG_THRESHOLD.HANDICAP } };
  const dcWhere = { predDcCorrect: { not: null }, predDcProb: { gte: STRONG_THRESHOLD.DOUBLE_CHANCE } };
  const ouWhere = {
    predOverCorrect: { not: null },
    OR: [
      { predOverProb: { gte: STRONG_THRESHOLD.OVER_UNDER } },
      { predOverProb: { lte: 1 - STRONG_THRESHOLD.OVER_UNDER } },
    ],
  };
  const x12Where = {
    predCorrect: { not: null },
    OR: [
      { predHome: { gte: STRONG_THRESHOLD["1X2"] } },
      { predDraw: { gte: STRONG_THRESHOLD["1X2"] } },
      { predAway: { gte: STRONG_THRESHOLD["1X2"] } },
    ],
  };

  const [hcN, hcHit, dcN, dcHit, ouN, ouHit, x12N, x12Hit] = await Promise.all([
    prisma.match.count({ where: hcWhere }),
    prisma.match.count({ where: { ...hcWhere, predHcCorrect: true } }),
    prisma.match.count({ where: dcWhere }),
    prisma.match.count({ where: { ...dcWhere, predDcCorrect: true } }),
    prisma.match.count({ where: ouWhere }),
    prisma.match.count({ where: { ...ouWhere, predOverCorrect: true } }),
    prisma.match.count({ where: x12Where }),
    prisma.match.count({ where: { ...x12Where, predCorrect: true } }),
  ]);
  const total = hcN + dcN + ouN + x12N;
  const hit = hcHit + dcHit + ouHit + x12Hit;
  return { total, hit, rate: total ? (hit / total) * 100 : 0 };
}
