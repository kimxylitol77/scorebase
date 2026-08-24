// AI 성적표·벤치마크 집계에 넣을 예측을 거르는 단일 규칙.
//
// 이 벤치마크의 유일한 핵심 주장은 "예측이 킥오프 전에 찍혔다" 이다.
// 아직 일어나지 않은 경기라서 모델이 정답을 학습했을 수 없다는 것 — 그게 전부다.
// 이 보증이 한 건이라도 깨지면 숫자 전체가 무의미해지므로, 집계 지점마다 따로
// 판단하지 말고 여기 한 곳을 거쳐야 한다.
//
// 실제로 2026-06-27 첫 가동일에 그날 이미 시작된 경기까지 시딩되어
// 킥오프 이후 예측 56건(경기 14개, scorebase·gpt-5.5)이 들어왔다.
// 이후 재발은 없다. 행을 지우지 않고 읽는 시점에 거른다 — 감사 이력은 남겨 둔다.

/** 집계 쿼리에서 이 두 필드를 반드시 함께 select 해야 한다. */
export interface KickoffGuardFields {
  predictedAt: Date;
  match: { startTime: Date };
}

/** 킥오프 전에 찍힌 예측만 true. 집계·적중률 계산 전에 반드시 통과시킨다. */
export function predictedBeforeKickoff(r: KickoffGuardFields): boolean {
  return r.predictedAt.getTime() < r.match.startTime.getTime();
}

/** 방법론 문서·영문 벤치마크 페이지가 공유하는 제외 규칙 설명. */
export const EXCLUSION_NOTE_KO =
  "킥오프 이후에 생성된 예측은 집계에서 제외한다 (첫 가동일 2026-06-27 시딩분 56건).";
export const EXCLUSION_NOTE_EN =
  "Predictions created after kick-off are excluded (56 rows seeded on 2026-06-27, the first day of operation).";
