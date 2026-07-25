// F1 드라이버 연봉(추정) — data/f1-salaries.json 로더 (미디어 종합 추정치 큐레이션).
//
// F1 팀은 연봉을 공식 발표하지 않는다 → RacingNews365 등 미디어 종합 추정 기본급(보너스 제외).
// 소스·기준일은 JSON 의 source/sourceUrl/asOf 필드. 시즌 개막 전 연 1회 수동 갱신.

import salaryData from "../../../data/f1-salaries.json";

export interface F1SalaryRow {
  rank: number; // 동률은 같은 순위
  name: string;
  nameKo: string;
  team: string; // espn-f1 F1_TEAM_KO 키와 동일한 영문 팀명
  salary: number; // 연봉 추정 기본급 (USD)
}

interface F1SalaryData {
  season: string;
  asOf: string;
  source: string;
  sourceUrl: string;
  note: string;
  drivers: Omit<F1SalaryRow, "rank">[];
}

const DATA = salaryData as F1SalaryData;

export const F1_SALARY_SEASON: string = DATA.season;
export const F1_SALARY_AS_OF: string = DATA.asOf;
export const F1_SALARY_SOURCE: string = DATA.source;
export const F1_SALARY_SOURCE_URL: string = DATA.sourceUrl;

/** 연봉 내림차순 + 동률 같은 순위 (KBO withRanks 규칙과 동일). */
function withRanks(drivers: Omit<F1SalaryRow, "rank">[]): F1SalaryRow[] {
  const sorted = [...drivers].sort((a, b) => b.salary - a.salary);
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

const RANKED: F1SalaryRow[] = withRanks(DATA.drivers);

export function getF1Salaries(): F1SalaryRow[] {
  return RANKED;
}
