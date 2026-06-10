// 한 팀의 시즌 Elo 변천사 추적.
// calcEloTable 과 같은 알고리즘이지만 매치마다 스냅샷을 남긴다.

import type { PredictMatch } from "./types";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";

const STARTING_ELO = 1500;
const K_FACTOR = 20;
const HOME_ADVANTAGE_ELO = 100;

function expectedScore(rA: number, rB: number) {
  return 1 / (1 + Math.pow(10, (rB - rA) / 400));
}

export interface EloPoint {
  matchId: number;
  date: Date;
  rating: number;
  /** 매치 후 변동량 (+ 상승, - 하락) */
  delta: number;
}

/**
 * 입력 매치들로 시즌 Elo 를 누적하면서, 각 팀의 매치별 Elo 시계열을 반환.
 */
export function calcEloHistory(
  matches: PredictMatch[],
  teamIds: number[],
): Map<number, EloPoint[]> {
  const ratings = new Map<number, number>();
  const history = new Map<number, EloPoint[]>();
  for (const id of teamIds) {
    history.set(id, []);
  }

  const sorted = [...matches].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );

  for (const m of sorted) {
    if (
      m.status !== "FINISHED" ||
      m.homeScore === null ||
      m.awayScore === null
    ) {
      continue;
    }

    const home = ratings.get(m.homeTeamId) ?? STARTING_ELO;
    const away = ratings.get(m.awayTeamId) ?? STARTING_ELO;

    // e스포츠(BO 시리즈)는 홈 어드밴티지 없음 — calcEloTable 과 동일 규칙
    const ha = LOL_LEAGUES.has(m.league) ? 0 : HOME_ADVANTAGE_ELO;
    const expHome = expectedScore(home + ha, away);

    let s: number;
    if (m.homeScore > m.awayScore) s = 1;
    else if (m.homeScore < m.awayScore) s = 0;
    else s = 0.5;

    const newHome = home + K_FACTOR * (s - expHome);
    const newAway = away + K_FACTOR * (1 - s - (1 - expHome));

    ratings.set(m.homeTeamId, newHome);
    ratings.set(m.awayTeamId, newAway);

    if (history.has(m.homeTeamId)) {
      history.get(m.homeTeamId)!.push({
        matchId: m.id,
        date: m.startTime,
        rating: newHome,
        delta: newHome - home,
      });
    }
    if (history.has(m.awayTeamId)) {
      history.get(m.awayTeamId)!.push({
        matchId: m.id,
        date: m.startTime,
        rating: newAway,
        delta: newAway - away,
      });
    }
  }

  return history;
}
