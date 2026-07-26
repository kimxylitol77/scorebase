// 축구 빅5 리그 연봉(추정) — data/soccer-salaries.json 로더 (Capology 기반 미디어 종합 추정 큐레이션).
//
// 클럽은 연봉을 공식 발표하지 않는다 → 미디어 종합 추정 세전 연봉(보너스 제외, EUR).
// 소스·기준일은 JSON 의 source/sourceUrl/asOf 필드. 시즌 개막 후 연 1회 수동 갱신.
// F1(f1-salaries.ts)과 같은 정적 큐레이션 패턴 — DB·cron 미경유, 페이지가 직접 읽는다.

import salaryData from "../../../data/soccer-salaries.json";

export type SoccerBigLeague = "EPL" | "LALIGA" | "BUNDESLIGA" | "SERIE_A" | "LIGUE_1";

export interface SoccerSalaryRow {
  rank: number; // 동률은 같은 순위
  name: string;
  nameKo: string;
  team: string; // 영문 클럽명 (DB Team 로고 매칭 키)
  teamKo: string;
  league: SoccerBigLeague;
  salary: number; // 세전 연봉 추정 (EUR)
}

interface SoccerSalaryData {
  season: string;
  asOf: string;
  source: string;
  sourceUrl: string;
  note: string;
  players: Omit<SoccerSalaryRow, "rank">[];
}

const DATA = salaryData as SoccerSalaryData;

export const SOCCER_SALARY_SEASON: string = DATA.season;
export const SOCCER_SALARY_AS_OF: string = DATA.asOf;
export const SOCCER_SALARY_SOURCE: string = DATA.source;
export const SOCCER_SALARY_SOURCE_URL: string = DATA.sourceUrl;

export const SOCCER_LEAGUE_KO: Record<SoccerBigLeague, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에 A",
  LIGUE_1: "리그 1",
};

/** 연봉 내림차순 + 동률 같은 순위 (F1 withRanks 규칙과 동일). */
function withRanks(players: Omit<SoccerSalaryRow, "rank">[]): SoccerSalaryRow[] {
  const sorted = [...players].sort((a, b) => b.salary - a.salary);
  let lastSalary = -1;
  let lastRank = 0;
  return sorted.map((d, i) => {
    if (d.salary !== lastSalary) {
      lastRank = i + 1;
      lastSalary = d.salary;
    }
    return { ...d, rank: lastRank };
  });
}

const RANKED: SoccerSalaryRow[] = withRanks(DATA.players);

export function getSoccerSalaries(): SoccerSalaryRow[] {
  return RANKED;
}
