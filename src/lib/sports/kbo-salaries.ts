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
}

/** KBO 연봉 시즌 라벨 — 연 1회 발표. 매년 갱신 시 데이터와 함께 수정. */
export const KBO_SALARY_SEASON = "2026";

// 2026 KBO 국내 선수 연봉 TOP 10 — KBO 공식 + 언론(taemano 등) 교차검증.
// 양의지 42억(역대 최고)·고영표 26억·최정 22억·류현진/박세웅 21억·오지환 14억 = 공식·언론 일치 확인분.
const KBO_SALARIES_2026: KboSalary[] = [
  { rank: 1, playerName: "양의지", teamName: "두산", position: "포수", salary: 420000 },
  { rank: 2, playerName: "고영표", teamName: "KT", position: "투수", salary: 260000 },
  { rank: 3, playerName: "최정", teamName: "SSG", position: "내야수", salary: 220000 },
  { rank: 4, playerName: "류현진", teamName: "한화", position: "투수", salary: 210000 },
  { rank: 4, playerName: "박세웅", teamName: "롯데", position: "투수", salary: 210000 },
  { rank: 6, playerName: "최원태", teamName: "삼성", position: "투수", salary: 160000 },
  { rank: 7, playerName: "장현식", teamName: "LG", position: "투수", salary: 150000 },
  { rank: 7, playerName: "김광현", teamName: "SSG", position: "투수", salary: 150000 },
  { rank: 9, playerName: "오지환", teamName: "LG", position: "내야수", salary: 140000 },
  { rank: 10, playerName: "박종훈", teamName: "SSG", position: "투수", salary: 110000 },
];

/** KBO 국내 선수 연봉 큐레이션 반환. 정적 데이터(네트워크 호출 없음). */
export function getKboSalaries(): KboSalary[] {
  return KBO_SALARIES_2026;
}
