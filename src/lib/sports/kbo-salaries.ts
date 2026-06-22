// KBO 선수 연봉 랭킹 — 국내 선수 상위 큐레이션 (KBO 공식 + 언론 교차검증).
//
// ⚠️ KBO 전체 연봉 DB 는 무료 공개 소스 없음(statiz 는 로그인 회원 전용 = 무단 스크랩 불가).
//    MLB(spotrac)처럼 자동 스크래핑 불가 → KBO 공식 보도자료 + 언론 정리를 교차검증한 국내 TOP 10 하드코딩.
// ⚠️ KBO 연봉은 연 1회(1~3월) 발표·시즌 중 불변 → cron 자동 갱신 의미 없음. 매년 발표 후 이 배열만 갱신.
// ⚠️ 단위 = 만원 (42억 = 420000). PlayerSalary.salary 가 Int(최대 ~21.5억)라 원 단위(42억=4.2e9) 저장 불가.
//    표시는 page 단에서 "42억"·"1억 5,000만원" 한국식 변환. 외국인 선수는 달러 별도 공시라 제외.
// 출처: KBO 공식 2026 연봉 현황 발표 + 언론 종합. 국내 선수 공시 연봉(계약금·옵션 제외) 기준.

export interface KboSalary {
  rank: number;
  playerName: string; // 한글명 (KBO 공식 표기)
  teamName: string; // 한글 구단명
  position: string; // 포수 | 투수 | 내야수 | 외야수
  salary: number; // 만원 단위
  birthday: string; // 생년월일 "YYYY-MM-DD" (KBO 공식·위키 교차검증) — 나이 컬럼용
}

/** KBO 연봉 시즌 라벨 — 연 1회 발표. 매년 갱신 시 데이터와 함께 수정. */
export const KBO_SALARY_SEASON = "2026";

// 2026 KBO 국내 선수 연봉 TOP 10 — KBO 공식 + 언론(taemano 등) 교차검증.
// 양의지 42억(역대 최고)·고영표 26억·최정 22억·류현진/박세웅 21억·오지환 14억 = 공식·언론 일치 확인분.
const KBO_SALARIES_2026: KboSalary[] = [
  { rank: 1, playerName: "양의지", teamName: "두산", position: "포수", salary: 420000, birthday: "1987-06-05" },
  { rank: 2, playerName: "고영표", teamName: "KT", position: "투수", salary: 260000, birthday: "1991-09-16" },
  { rank: 3, playerName: "최정", teamName: "SSG", position: "내야수", salary: 220000, birthday: "1987-02-28" },
  { rank: 4, playerName: "류현진", teamName: "한화", position: "투수", salary: 210000, birthday: "1987-03-25" },
  { rank: 4, playerName: "박세웅", teamName: "롯데", position: "투수", salary: 210000, birthday: "1995-11-30" },
  { rank: 6, playerName: "최원태", teamName: "삼성", position: "투수", salary: 160000, birthday: "1997-01-07" },
  { rank: 7, playerName: "장현식", teamName: "LG", position: "투수", salary: 150000, birthday: "1995-02-24" },
  { rank: 7, playerName: "김광현", teamName: "SSG", position: "투수", salary: 150000, birthday: "1988-07-22" },
  { rank: 9, playerName: "오지환", teamName: "LG", position: "내야수", salary: 140000, birthday: "1990-03-12" },
  { rank: 10, playerName: "박종훈", teamName: "SSG", position: "투수", salary: 110000, birthday: "1991-08-13" },
];

/** KBO 국내 선수 연봉 큐레이션 반환. 정적 데이터(네트워크 호출 없음). */
export function getKboSalaries(): KboSalary[] {
  return KBO_SALARIES_2026;
}

// 연봉 랭킹 선수명 → 생년월일("YYYY-MM-DD"). 나이 컬럼이 DB PlayerSalary 행에 매핑할 때 사용.
export const KBO_SALARY_BIRTHDAYS: Record<string, string> = Object.fromEntries(
  KBO_SALARIES_2026.map((s) => [s.playerName, s.birthday]),
);

// 연봉 랭킹 선수명 → koreabaseball playerId (선수 상세 /players/{id}?league=KBO 링크용).
// PitcherBasic/HitterBasic 인덱스 + 검색으로 확보. 매년 연봉 배열 갱신 시 함께 갱신.
// (김광현은 1군 등록 인덱스엔 없으나 playerId 직접 확보분.)
export const KBO_SALARY_PLAYER_IDS: Record<string, string> = {
  양의지: "76232",
  고영표: "64001",
  최정: "75847",
  류현진: "76715",
  박세웅: "64021",
  최원태: "65320",
  장현식: "63950",
  김광현: "77829",
  오지환: "79109",
  박종훈: "60841",
};
