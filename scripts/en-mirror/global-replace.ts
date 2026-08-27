// 전 파일 공통 치환 — 한국어를 **반환하는 함수 호출**은 사전이 못 잡는다.
//
// 사전은 소스에 박힌 한글 리터럴만 치환한다. 라벨이 함수로 빠지는 순간 영어판에 한국어가
// 샌다 (2026-08-27 postponedLabel 도입 때 /en ArticleCard 가 "연기·취소" 를 그대로 출력).
// 호출부가 11곳이라 페이지별 override 로는 빠뜨리기 쉬워 여기서 한 번에 막는다.
//
// 규칙을 넣기 전에 확인할 것 — 치환 결과가 영어판의 **기존 문구와 같아야** 한다.
// postponedLabel 은 한국어에서만 종목별로 갈리고(야구 "취소"), 영어판은 종전대로 Postponed 다.
export const GLOBAL_REPLACE: [string, string][] = [
  ["postponedLabel(league)", '"Postponed"'],
  ["postponedLabel(match.league)", '"Postponed"'],
  ["postponedLabel(article.league)", '"Postponed"'],
  ["postponedLabel(b.league)", '"Postponed"'],
  ["postponedLabel(m.league)", '"Postponed"'],
  ["postponedLabel(postponedList.map((m) => m.league))", '"Postponed"'],
  ["postponedLabel(postponedSorted.map((m) => m.league))", '"Postponed"'],
];

/** 해당 호출이 없는 파일이 대부분이라 미적용 경고는 내지 않는다. */
export function applyGlobalReplace(src: string): string {
  return GLOBAL_REPLACE.reduce(
    (acc, [from, to]) => (acc.includes(from) ? acc.split(from).join(to) : acc),
    src,
  );
}
