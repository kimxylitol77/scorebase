// KBO 선수 연봉 — data/kbo-salaries.json 로더 (KBO 공식 선수 프로필 전수 수집분).
//
// 수집: `npx tsx scripts/collect-kbo-salaries.ts` — 10 구단 전체 명단(퓨처스 포함) → 공식 프로필의 연봉 필드.
// ⚠️ KBO 연봉은 연 1회(1~3월) 발표 후 시즌 중 불변 → cron 자동 갱신 대상이 아니다. 매년 발표 후 위 스크립트를
//    한 번 돌려 JSON 을 갱신·커밋한다. cron(fetch-salaries)은 이 JSON 을 DB 에 멱등 replace 할 뿐이다.
// ⚠️ 단위 = 만원 (42억 = 420000). PlayerSalary.salary 가 Int 라 원 단위 저장 불가.
// ⚠️ 외국인 선수는 달러로 별도 공시되어 수집 단계에서 제외된다(원화 랭킹 일관성).

import salaryData from "../../../data/kbo-salaries.json";

export interface KboSalaryRow {
  rank: number; // 연봉 순위 (동률은 같은 순위)
  kboId: string; // koreabaseball playerId — /players/{id}?league=KBO 링크용
  playerName: string;
  teamName: string; // 한글 구단명
  position: string; // 투수 | 포수 | 내야수 | 외야수
  salary: number; // 국내=만원 단위 / 외국인=달러
  signingBonus?: number; // 입단 계약금 (연봉과 같은 통화)
  draft?: string; // "22 한화 2차 1라운드 1순위"
  birthday?: string; // "YYYY-MM-DD"
}

/** 연봉 내림차순 배열에 동률 순위를 매긴다. */
function withRanks(players: Omit<KboSalaryRow, "rank">[]): KboSalaryRow[] {
  let lastSalary = -1;
  let lastRank = 0;
  return players.map((p, i) => {
    if (p.salary !== lastSalary) {
      lastRank = i + 1;
      lastSalary = p.salary;
    }
    return { ...p, rank: lastRank };
  });
}

/** KBO 연봉 시즌 라벨 — 연 1회 발표. */
export const KBO_SALARY_SEASON: string = salaryData.season;

/** 수집 일자 ("YYYY-MM-DD") — 페이지 출처 표기용. */
export const KBO_SALARY_COLLECTED_AT: string = salaryData.collectedAt;

// 연봉 내림차순은 수집 스크립트가 이미 정렬해 둔 상태 → 여기서는 동률 순위만 매긴다.
const RANKED: KboSalaryRow[] = withRanks(salaryData.players);
const RANKED_FOREIGN: KboSalaryRow[] = withRanks(salaryData.foreign);

/** 국내 선수 연봉 랭킹 (만원 단위, 내림차순). 정적 데이터 — 네트워크 호출 없음. */
export function getKboSalaries(): KboSalaryRow[] {
  return RANKED;
}

/**
 * 외국인 선수 연봉 랭킹 (**달러 단위**, 내림차순).
 * KBO 가 외국인만 달러로 공시해 국내 선수와 한 랭킹에 못 섞는다 — 표를 따로 두고 쓴다.
 * PlayerSalary 테이블에는 통화 구분이 없어 DB 를 거치지 않고 이 JSON 을 직접 읽는다.
 */
export function getKboForeignSalaries(): KboSalaryRow[] {
  return RANKED_FOREIGN;
}

// 동명이인이 44건(김현수 4명 등) 있어 이름 단독 키는 엉뚱한 선수로 연결된다 → 구단을 함께 쓴다.
// 같은 구단 안에도 동명이인이 7건 남는다(삼성 김태훈 = 3억 / 6천만원) → 연봉 높은 쪽이 이기게 한다.
// 이 조회는 상위권 랭킹 표시에만 쓰이고, 거기 오르는 쪽은 항상 고액자다.
const BY_NAME_TEAM = new Map<string, KboSalaryRow>();
for (const r of RANKED) {
  const key = `${r.playerName}|${r.teamName}`;
  if (!BY_NAME_TEAM.has(key)) BY_NAME_TEAM.set(key, r); // RANKED 는 연봉 내림차순
}

/** 이름+구단으로 공식 프로필 정보(선수ID·생년월일·지명순위) 조회. */
export function lookupKboSalaryPlayer(
  playerName: string,
  teamName: string,
): KboSalaryRow | undefined {
  return BY_NAME_TEAM.get(`${playerName}|${teamName}`);
}
