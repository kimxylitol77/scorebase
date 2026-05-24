// NBA/NHL 플레이오프 우승 시뮬레이션 (Monte Carlo).
//
// 입력: 현재 라운드 진행 상태 (bracket) + 팀별 Elo
// 시뮬: 진행 중 시리즈 잔여 게임 → 다음 라운드 매치업 → ... → 결승
// 출력: 팀별 [컨파 진출 / 결승 진출 / 우승] 확률
//
// 매치업 구조 가정 (NBA/NHL 표준):
// - 1라운드: 동/서 각 4 시리즈 (8팀씩 진출)
// - 2라운드(CONF_SEMIS): 동/서 각 2 시리즈
// - 컨퍼런스 파이널: 동/서 각 1 시리즈
// - 결승: 동/서 컨파 winner 매치

import type {
  NbaPlayoffSeries,
  NbaRound,
} from "./nba-playoffs";

export interface PlayoffWinProb {
  teamId: number;
  teamName: string;
  shortName?: string | null;
  logoUrl?: string | null;
  conference: "EAST" | "WEST";
  confFinals: number; // 컨파 진출 확률
  finals: number; // 결승 진출 확률
  champion: number; // 우승 확률
}

interface EloMap {
  [teamId: number]: number;
}

const ROUND_RANK: Record<NbaRound, number> = {
  FIRST_ROUND: 1,
  CONF_SEMIS: 2,
  CONF_FINALS: 3,
  FINALS: 4,
};

/** Elo 기반 단일 게임 승률 (홈코트 어드밴티지 미반영 — 시리즈 4 홈 / 3 원정 평균) */
function singleGameProb(elo1: number, elo2: number): number {
  return 1 / (1 + Math.pow(10, (elo2 - elo1) / 400));
}

/** BO7 시리즈 시뮬레이션 — 현재 wins 부터 4선승까지 */
function simulateSeries(
  elo1: number,
  elo2: number,
  t1Wins: number,
  t2Wins: number,
  winsNeeded: number,
): 1 | 2 {
  let w1 = t1Wins;
  let w2 = t2Wins;
  while (w1 < winsNeeded && w2 < winsNeeded) {
    if (Math.random() < singleGameProb(elo1, elo2)) w1++;
    else w2++;
  }
  return w1 >= winsNeeded ? 1 : 2;
}

interface TeamMeta {
  id: number;
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  conference: "EAST" | "WEST";
}

/** bracket 의 series 들에서 각 팀의 meta (id/이름/컨퍼런스) 추출 */
function extractTeamMeta(bracket: NbaPlayoffSeries[]): Map<number, TeamMeta> {
  const map = new Map<number, TeamMeta>();
  for (const s of bracket) {
    if (s.conference === null) continue; // FINALS 단계는 컨퍼런스 없음, skip
    for (const t of [s.team1, s.team2]) {
      if (!map.has(t.id)) {
        map.set(t.id, {
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          logoUrl: t.logoUrl,
          conference: s.conference,
        });
      }
    }
  }
  return map;
}

/**
 * 플레이오프 우승 확률 시뮬레이션.
 *
 * @param bracket 현재 플레이오프 브라켓 (1R/2R/CF/F 시리즈)
 * @param eloMap 팀별 Elo
 * @param opts.iterations 시뮬 횟수 (기본 5000)
 */
export function simulatePlayoff(
  bracket: NbaPlayoffSeries[],
  eloMap: EloMap,
  opts?: { iterations?: number },
): PlayoffWinProb[] {
  const iter = opts?.iterations ?? 5000;
  const teams = extractTeamMeta(bracket);
  if (teams.size === 0) return [];

  // 진행 중 라운드 결정 — 가장 높은 라운드의 미완료 시리즈가 있는 단계
  const currentRound = findCurrentRound(bracket);
  if (!currentRound) return []; // 모든 시리즈 완료 (시즌 끝)

  // 카운터 초기화
  const counters: Record<number, { cf: number; f: number; champ: number }> = {};
  for (const [tid] of teams) counters[tid] = { cf: 0, f: 0, champ: 0 };

  // 시뮬 본체
  for (let s = 0; s < iter; s++) {
    runSingleSim(bracket, eloMap, currentRound, teams, counters);
  }

  // 결과 정리
  const out: PlayoffWinProb[] = [];
  for (const [tid, meta] of teams) {
    const c = counters[tid];
    out.push({
      teamId: tid,
      teamName: meta.name,
      shortName: meta.shortName,
      logoUrl: meta.logoUrl,
      conference: meta.conference,
      confFinals: c.cf / iter,
      finals: c.f / iter,
      champion: c.champ / iter,
    });
  }
  // 우승 확률 내림차순
  out.sort((a, b) => b.champion - a.champion);
  return out;
}

/** 현재 진행 중인 라운드 — 미완료 시리즈가 있는 라운드 중 가장 낮은 단계 */
function findCurrentRound(bracket: NbaPlayoffSeries[]): NbaRound | null {
  const rounds: NbaRound[] = ["FIRST_ROUND", "CONF_SEMIS", "CONF_FINALS", "FINALS"];
  for (const r of rounds) {
    const inRound = bracket.filter((s) => s.round === r);
    if (inRound.length === 0) continue;
    const hasIncomplete = inRound.some((s) => !s.completed);
    if (hasIncomplete) return r;
  }
  return null;
}

/** 한 번의 Monte Carlo 시뮬 (현재 라운드 → 결승까지) */
function runSingleSim(
  bracket: NbaPlayoffSeries[],
  eloMap: EloMap,
  currentRound: NbaRound,
  teams: Map<number, TeamMeta>,
  counters: Record<number, { cf: number; f: number; champ: number }>,
): void {
  const currentRank = ROUND_RANK[currentRound];

  // 각 컨퍼런스의 현재 라운드 진출자 (또는 시뮬 결과 winner) 추적
  const advanced: Record<"EAST" | "WEST", number[]> = { EAST: [], WEST: [] };

  // 현재 라운드 + 그 이전 완료된 라운드에서 진출자 결정
  if (currentRound === "FIRST_ROUND") {
    // 1라운드 시리즈 시뮬레이션
    for (const s of bracket.filter((b) => b.round === "FIRST_ROUND")) {
      const winner = simSeriesNow(s, eloMap);
      if (s.conference) advanced[s.conference].push(winner);
    }
    // 이후 라운드는 시드 정보 없이 진출자만으로 시뮬 (단순화 — 같은 컨퍼런스에서 만남)
    simRemainingFromConfSemis(advanced, eloMap, teams, counters);
  } else if (currentRound === "CONF_SEMIS") {
    // 1라운드 진출자 (= 2라운드 참가자) 는 이미 series 데이터에 들어있음
    for (const s of bracket.filter((b) => b.round === "CONF_SEMIS")) {
      const winner = simSeriesNow(s, eloMap);
      if (s.conference) advanced[s.conference].push(winner);
    }
    simRemainingFromConfFinals(advanced, eloMap, teams, counters);
  } else if (currentRound === "CONF_FINALS") {
    for (const s of bracket.filter((b) => b.round === "CONF_FINALS")) {
      const winner = simSeriesNow(s, eloMap);
      if (s.conference) advanced[s.conference].push(winner);
    }
    simFinalsOnly(advanced, eloMap, counters);
  } else if (currentRound === "FINALS") {
    const finals = bracket.find((b) => b.round === "FINALS");
    if (finals) {
      const winner = simSeriesNow(finals, eloMap);
      counters[winner].champ++;
      // FINALS 진출자는 자동으로 finals + cf 카운트
      counters[finals.team1.id].f++;
      counters[finals.team1.id].cf++;
      counters[finals.team2.id].f++;
      counters[finals.team2.id].cf++;
    }
  }

  // FINALS 가 아닌 경우 — currentRound 시뮬 결과 따라 카운터 갱신.
  // 단, runSingleSim 의 simRemainingFrom* 들이 내부적으로 counters 증가.
  // currentRound === "CONF_SEMIS" 면 cf 진출자 카운트 추가.
  if (currentRank <= ROUND_RANK.CONF_SEMIS) {
    // simRemainingFromConfSemis 또는 simRemainingFromConfFinals 가 처리
  }
}

/** 시리즈를 현재 wins 부터 시뮬 — 이미 끝났으면 그 결과 그대로 */
function simSeriesNow(s: NbaPlayoffSeries, eloMap: EloMap): number {
  if (s.completed) {
    return s.team1.wins > s.team2.wins ? s.team1.id : s.team2.id;
  }
  const elo1 = eloMap[s.team1.id] ?? 1500;
  const elo2 = eloMap[s.team2.id] ?? 1500;
  const winsNeeded = Math.ceil(s.totalGames / 2);
  const w = simulateSeries(elo1, elo2, s.team1.wins, s.team2.wins, winsNeeded);
  return w === 1 ? s.team1.id : s.team2.id;
}

/** 컨파 (CF) 부터 결승까지 시뮬 — 각 컨퍼런스에 진출자 2명 있다고 가정 */
function simRemainingFromConfFinals(
  advanced: Record<"EAST" | "WEST", number[]>,
  eloMap: EloMap,
  teams: Map<number, TeamMeta>,
  counters: Record<number, { cf: number; f: number; champ: number }>,
): void {
  // 컨파 진출 카운트
  for (const tid of [...advanced.EAST, ...advanced.WEST]) {
    if (counters[tid]) counters[tid].cf++;
  }
  // 컨파 시뮬 — 각 컨퍼런스 진출자 2명 매치
  const finals: number[] = [];
  for (const conf of ["EAST", "WEST"] as const) {
    const list = advanced[conf];
    if (list.length < 2) continue;
    const winner = simSeriesNow(
      makeSyntheticSeries(list[0], list[1], teams, conf),
      eloMap,
    );
    finals.push(winner);
  }
  // 결승 진출
  for (const tid of finals) {
    if (counters[tid]) counters[tid].f++;
  }
  // 결승 시뮬
  if (finals.length === 2) {
    const winner = simSeriesNow(
      makeSyntheticSeries(finals[0], finals[1], teams, null),
      eloMap,
    );
    if (counters[winner]) counters[winner].champ++;
  }
}

/** 2라운드 (CS) 부터 시뮬 — 각 컨퍼런스에 진출자 4명 */
function simRemainingFromConfSemis(
  advanced: Record<"EAST" | "WEST", number[]>,
  eloMap: EloMap,
  teams: Map<number, TeamMeta>,
  counters: Record<number, { cf: number; f: number; champ: number }>,
): void {
  // 2라운드 시뮬 → 각 컨퍼런스 4명 → 2명
  const semiWinners: Record<"EAST" | "WEST", number[]> = { EAST: [], WEST: [] };
  for (const conf of ["EAST", "WEST"] as const) {
    const list = advanced[conf];
    // 단순화: 시드 정보 없으니 인접 페어 (1&2 vs 3&4) 가정
    for (let i = 0; i < list.length; i += 2) {
      if (i + 1 >= list.length) break;
      const winner = simSeriesNow(
        makeSyntheticSeries(list[i], list[i + 1], teams, conf),
        eloMap,
      );
      semiWinners[conf].push(winner);
    }
  }
  simRemainingFromConfFinals(semiWinners, eloMap, teams, counters);
}

/** 컨파 결과 → 결승만 시뮬 */
function simFinalsOnly(
  advanced: Record<"EAST" | "WEST", number[]>,
  eloMap: EloMap,
  counters: Record<number, { cf: number; f: number; champ: number }>,
): void {
  // 컨파 winner = 결승 진출자
  for (const tid of [...advanced.EAST, ...advanced.WEST]) {
    if (counters[tid]) {
      counters[tid].cf++; // 컨파 진출도 (이미 진입한 거)
      counters[tid].f++;
    }
  }
  if (advanced.EAST.length === 1 && advanced.WEST.length === 1) {
    const elo1 = eloMap[advanced.EAST[0]] ?? 1500;
    const elo2 = eloMap[advanced.WEST[0]] ?? 1500;
    const winsNeeded = 4;
    const w = simulateSeries(elo1, elo2, 0, 0, winsNeeded);
    const winner = w === 1 ? advanced.EAST[0] : advanced.WEST[0];
    if (counters[winner]) counters[winner].champ++;
  }
}

/** 진출자만으로 합성 series 생성 (Elo 시뮬용) */
function makeSyntheticSeries(
  t1Id: number,
  t2Id: number,
  teams: Map<number, TeamMeta>,
  conference: "EAST" | "WEST" | null,
): NbaPlayoffSeries {
  const t1 = teams.get(t1Id);
  const t2 = teams.get(t2Id);
  return {
    round: "CONF_FINALS",
    conference,
    team1: {
      id: t1Id,
      name: t1?.name ?? `Team ${t1Id}`,
      shortName: t1?.shortName,
      logoUrl: t1?.logoUrl ?? null,
      wins: 0,
    },
    team2: {
      id: t2Id,
      name: t2?.name ?? `Team ${t2Id}`,
      shortName: t2?.shortName,
      logoUrl: t2?.logoUrl ?? null,
      wins: 0,
    },
    completed: false,
    totalGames: 7,
    summary: "",
    games: [],
  };
}
