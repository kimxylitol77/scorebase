// FIFA 월드컵 2026 토너먼트 Monte Carlo 시뮬레이션.
//
// 일반 리그 시즌 시뮬레이션과 다른 점:
// - 48팀 12조 → 조 1·2위 + 3위 중 상위 8 = 32팀 토너먼트
// - 토너먼트는 단판 승부, 무승부면 (간소화) Elo 비율로 PK 처리
// - 외부 시드 Elo 사용 (클럽 데이터로는 국가대표 강도 추정 불가)
//
// 결과: 각 팀의 GROUP_PASS / R32 / R16 / QF / SF / FINAL / CHAMP 진출 확률.

import { calcWinProbability } from "./win-probability";
import {
  WORLD_CUP_GROUPS,
  buildWorldCupSeedTable,
  getTeamGroup,
} from "./world-cup-elos";

export interface WorldCupResult {
  teamId: number;
  teamName: string;
  group: string;
  groupPass: number; // 32강 진출 (조별 1·2위 + 3위 best)
  r16: number; // 16강 진출
  qf: number; // 8강 진출
  sf: number; // 4강 진출
  final: number; // 결승 진출
  champion: number; // 우승 확률
  expectedPoints: number; // 조별예선 평균 승점
}

interface TeamSnap {
  id: number;
  name: string;
  group: string;
  elo: number;
}

interface GroupStanding {
  teamId: number;
  pts: number;
  gd: number;
  gf: number;
  /** 무작위 tie-break (실제로는 fair-play, 추첨 등) */
  rand: number;
}

interface SimCounters {
  groupPass: number;
  r16: number;
  qf: number;
  sf: number;
  final: number;
  champion: number;
  pointsSum: number;
}

/** 1X2 시뮬: Elo + 무승부 확률 → 결과 추첨. */
function simulateMatch(
  eloA: number,
  eloB: number,
): "A" | "DRAW" | "B" {
  // 토너먼트는 (실제로는) 무승부 처리 후 PK 가지만, 조별예선엔 무승부 가능.
  // 이 함수는 양쪽 다 호출됨 — 호출처에서 무승부 허용 여부 결정.
  const wp = calcWinProbability(eloA, eloB, "WORLD_CUP");
  const r = Math.random();
  if (r < wp.home) return "A";
  if (r < wp.home + wp.draw) return "DRAW";
  return "B";
}

/** 토너먼트 단판: 무승부면 Elo 비율로 한쪽 결정 (PK 단순화). */
function knockoutWinner(a: TeamSnap, b: TeamSnap): TeamSnap {
  const wp = calcWinProbability(a.elo, b.elo, "WORLD_CUP");
  // 무승부 확률을 양쪽 승률에 비례 분배
  const total = wp.home + wp.away;
  const homeShare = total > 0 ? wp.home / total : 0.5;
  return Math.random() < homeShare ? a : b;
}

/**
 * Monte Carlo 시뮬레이션. 기본 5,000회.
 *
 * @param teamIdToName  DB Team.id → 이름. 본선 등록된 48팀.
 * @param iterations    반복 횟수 (5,000 기본)
 */
export function simulateWorldCup(
  teamIdToName: Map<number, string>,
  iterations = 5000,
): WorldCupResult[] {
  const eloTable = buildWorldCupSeedTable(teamIdToName);

  // 팀 → snap 으로 변환
  const teams: TeamSnap[] = [];
  for (const [id, name] of teamIdToName.entries()) {
    const group = getTeamGroup(name);
    if (!group) continue; // 조 매핑 안 되는 팀은 시뮬에서 제외
    teams.push({
      id,
      name,
      group,
      elo: eloTable.ratings.get(id) ?? 1500,
    });
  }

  // 조별 그룹핑
  const teamsByGroup = new Map<string, TeamSnap[]>();
  for (const t of teams) {
    if (!teamsByGroup.has(t.group)) teamsByGroup.set(t.group, []);
    teamsByGroup.get(t.group)!.push(t);
  }

  // 카운터 초기화
  const counters = new Map<number, SimCounters>();
  for (const t of teams) {
    counters.set(t.id, {
      groupPass: 0,
      r16: 0,
      qf: 0,
      sf: 0,
      final: 0,
      champion: 0,
      pointsSum: 0,
    });
  }

  for (let iter = 0; iter < iterations; iter++) {
    // 1) 조별예선 시뮬
    const groupStandings = new Map<string, GroupStanding[]>();
    for (const [g, gTeams] of teamsByGroup.entries()) {
      const standing = new Map<number, GroupStanding>();
      for (const t of gTeams) {
        standing.set(t.id, { teamId: t.id, pts: 0, gd: 0, gf: 0, rand: Math.random() });
      }
      // 4팀 round-robin = 6경기
      for (let i = 0; i < gTeams.length; i++) {
        for (let j = i + 1; j < gTeams.length; j++) {
          const a = gTeams[i];
          const b = gTeams[j];
          const result = simulateMatch(a.elo, b.elo);
          // 단순화된 스코어 모델: 결과에 따라 1-0 / 1-1 / 0-1 / 2-1 등 무작위
          // 실제 골수 모델 없이 승점·대략적 GD 만 채운다.
          const sa = standing.get(a.id)!;
          const sb = standing.get(b.id)!;
          if (result === "A") {
            sa.pts += 3;
            const margin = 1 + Math.floor(Math.random() * 2);
            sa.gd += margin;
            sb.gd -= margin;
            sa.gf += margin;
          } else if (result === "B") {
            sb.pts += 3;
            const margin = 1 + Math.floor(Math.random() * 2);
            sb.gd += margin;
            sa.gd -= margin;
            sb.gf += margin;
          } else {
            sa.pts += 1;
            sb.pts += 1;
            const draws = Math.floor(Math.random() * 3); // 0-0, 1-1, 2-2
            sa.gf += draws;
            sb.gf += draws;
          }
        }
      }
      const sorted = Array.from(standing.values()).sort(compareStanding);
      groupStandings.set(g, sorted);
      // 평균 승점 누적
      for (const s of sorted) {
        counters.get(s.teamId)!.pointsSum += s.pts;
      }
    }

    // 2) 32강 진출 확정 — 조 1·2위(24팀) + 3위 중 상위 8팀
    const advanced = new Set<number>();
    const thirdPlace: GroupStanding[] = [];
    for (const sorted of groupStandings.values()) {
      advanced.add(sorted[0].teamId);
      advanced.add(sorted[1].teamId);
      thirdPlace.push(sorted[2]);
    }
    thirdPlace.sort(compareStanding);
    for (let i = 0; i < 8; i++) advanced.add(thirdPlace[i].teamId);

    for (const id of advanced) counters.get(id)!.groupPass += 1;

    // 3) 토너먼트 — 32→16→8→4→결승
    // FIFA 가 정한 32강 매치업이 미정이라 무작위 셔플 페어링 (조 추첨 기반 실제
    // 브래킷은 사실상 시드 중립). 기존 pairTopBottom(상위↔하위 고정)은 매 iteration
    // 중위 시드가 최강팀과 강제 매칭돼 r16 이 비현실적으로 급락하던 편향
    // (2026-06-10: 한국 32강 70% → 16강 8.7% 로 왜곡, 셔플 후 ~30%대 정상화).
    // 실제 매치업 발표되면 이 부분만 조 위치 기반으로 갱신하면 됨.
    let bracket: TeamSnap[] = teams.filter((t) => advanced.has(t.id));
    shuffleInPlace(bracket);

    // 32강
    bracket = playRound(bracket, counters, "r16");
    // 16강
    bracket = playRound(bracket, counters, "qf");
    // 8강
    bracket = playRound(bracket, counters, "sf");
    // 4강
    bracket = playRound(bracket, counters, "final");
    // 결승
    if (bracket.length === 2) {
      const champ = knockoutWinner(bracket[0], bracket[1]);
      counters.get(champ.id)!.champion += 1;
    }
  }

  // 결과 정리
  const results: WorldCupResult[] = teams.map((t) => {
    const c = counters.get(t.id)!;
    return {
      teamId: t.id,
      teamName: t.name,
      group: t.group,
      groupPass: c.groupPass / iterations,
      r16: c.r16 / iterations,
      qf: c.qf / iterations,
      sf: c.sf / iterations,
      final: c.final / iterations,
      champion: c.champion / iterations,
      expectedPoints: c.pointsSum / iterations,
    };
  });
  // 우승 확률 내림차순
  return results.sort((a, b) => b.champion - a.champion);
}

function compareStanding(a: GroupStanding, b: GroupStanding): number {
  if (b.pts !== a.pts) return b.pts - a.pts;
  if (b.gd !== a.gd) return b.gd - a.gd;
  if (b.gf !== a.gf) return b.gf - a.gf;
  return b.rand - a.rand;
}

/** Fisher–Yates 셔플 (in place) — 토너먼트 무작위 페어링용. */
function shuffleInPlace(arr: TeamSnap[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** 라운드 진행 — 인접 페어가 매치. 통과한 팀에게 카운터 ++. */
function playRound(
  bracket: TeamSnap[],
  counters: Map<number, SimCounters>,
  passKey: keyof Omit<SimCounters, "pointsSum">,
): TeamSnap[] {
  const winners: TeamSnap[] = [];
  for (let i = 0; i < bracket.length; i += 2) {
    const w = knockoutWinner(bracket[i], bracket[i + 1]);
    counters.get(w.id)![passKey] += 1;
    winners.push(w);
  }
  return winners;
}
