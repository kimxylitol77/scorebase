// 게시판 이동 목적지 — 자유게시판 말머리(축구·야구·잡담) ↔ 스포츠 분석.
// 수정 폼(선택 UI)과 서버 액션(검증)이 같은 목록을 보게 한 곳에 모은다.
// 자유게시판 말머리는 Match 예측용 sport 필드를 재사용한다 (잡담 = null).

export interface MoveTarget {
  label: string;
  data: { category: string; sport?: string | null };
}

export const MOVE_TARGETS: Record<string, MoveTarget> = {
  "free:soccer": { label: "자유게시판 · 축구", data: { category: "FREE", sport: "soccer" } },
  "free:baseball": { label: "자유게시판 · 야구", data: { category: "FREE", sport: "baseball" } },
  "free:talk": { label: "자유게시판 · 잡담", data: { category: "FREE", sport: null } },
  // 분석 보드에서 sport 는 말머리가 아니라 종목이라 손대지 않고 그대로 둔다.
  analysis: { label: "스포츠 분석", data: { category: "ANALYSIS" } },
};

/**
 * 이동 가능 여부.
 * - 예측 픽이 붙은 글: 적중률 집계가 pick 기준이라 자유게시판으로 옮기면 픽 카드와 성격이 어긋난다.
 * - 해외 브리핑: 봇 전용 발행 보드라 회원 글이 섞이면 안 된다.
 */
export function canMovePost(post: { category: string; pick: string | null }): boolean {
  return !post.pick && !post.category.startsWith("BRIEFING");
}

/** 글이 지금 속한 목적지 키 — 수정 폼 셀렉트의 기본 선택값. */
export function currentBoardKey(post: { category: string; sport: string | null }): string {
  if (post.category !== "FREE") return "analysis";
  if (post.sport === "soccer") return "free:soccer";
  if (post.sport === "baseball") return "free:baseball";
  return "free:talk";
}
