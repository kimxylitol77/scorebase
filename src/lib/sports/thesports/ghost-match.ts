// ts 원본에서 사라진 유령 매치를 가려내는 판정 규칙 — 자동 삭제의 안전 가드를 한 곳에 모은다.
//
// 유령이란. ts 가 한때 내려줬다가 삭제한 매치가 우리 DB 에만 남은 것. 컵 대진이 확정되기
// 전의 가대진이 대표 사례다(2026-08-20 UECL "야기엘로니아 vs 야블로네츠" — 두 팀 모두
// 같은 날 다른 상대와 실경기가 따로 있었다). 화면에는 "배당만 안 나오는 경기"로 보인다.
//
// 판정을 uuid 단건 조회로만 하면 향후 7일 축구만 700건이 넘어 rate limit 에 걸린다.
// 그래서 2단계다. ① 날짜별 diary 목록으로 부재 후보를 좁히고(4~10 콜로 수천 uuid)
// ② 후보만 uuid 단건 조회로 확정한다. diary 부재만으로 단정하면 안 되는 이유는
// [[ts-diary-absent-vs-reschedule]] — 다른 날로 옮겨간 경기도 부재로 보이기 때문이다.

/** 검사 창 — 이보다 먼 미래는 대진 확정 전이라 가대진이 정상적으로 섞인다. */
export const GHOST_LOOKAHEAD_DAYS = 7;

/** 한 런에서 삭제할 수 있는 최대 건수. 넘으면 삭제를 멈추고 사람에게 넘긴다. */
export const GHOST_DELETE_LIMIT = 20;

/**
 * 후보가 이 비율(또는 절대수)을 넘으면 ts 쪽 대량 이상으로 보고 삭제를 전면 중단한다.
 * 정상 상태의 실측 후보는 0건이었다(2026-08-20 축구 540건 대조). 몇 %만 나와도 이례적이다.
 */
export const GHOST_ABORT_RATIO = 0.2;
export const GHOST_ABORT_ABSOLUTE = 50;

/** "ts-abc" → "abc". ts 매치가 아니면 null. */
export function tsUuidOf(externalId: string): string | null {
  return externalId.startsWith("ts-") ? externalId.slice(3) : null;
}

export interface GhostCandidateInput {
  id: number;
  externalId: string;
}

/**
 * diary 목록에 없는 매치 = 1차 후보. 실존 여부는 호출부가 uuid 단건 조회로 확정한다.
 * ts 매치가 아닌 row 는 애초에 이 잡의 대상이 아니므로 조용히 제외한다.
 */
export function pickGhostCandidates<T extends GhostCandidateInput>(
  matches: T[],
  diaryUuids: Set<string>,
): T[] {
  return matches.filter((m) => {
    const uuid = tsUuidOf(m.externalId);
    return uuid != null && !diaryUuids.has(uuid);
  });
}

export type VolumeVerdict =
  | { proceed: true }
  | { proceed: false; reason: string };

/**
 * 후보 규모가 정상 범위인지. ts 가 하루치 목록을 통째로 빠뜨리거나 우리 diary 호출이
 * 부분 실패하면 멀쩡한 매치가 무더기로 후보가 된다 — 그 상태의 자동 삭제가 최악이다.
 */
export function assessCandidateVolume(
  candidates: number,
  total: number,
): VolumeVerdict {
  if (candidates === 0) return { proceed: true };
  if (candidates >= GHOST_ABORT_ABSOLUTE) {
    return {
      proceed: false,
      reason: `후보 ${candidates}건 — 절대 상한 ${GHOST_ABORT_ABSOLUTE} 초과`,
    };
  }
  if (total > 0 && candidates / total >= GHOST_ABORT_RATIO) {
    return {
      proceed: false,
      reason: `후보 ${candidates}/${total}건 — 대상의 ${Math.round((candidates / total) * 100)}% 로 비율 상한 초과`,
    };
  }
  return { proceed: true };
}

/**
 * 사람 흔적(승부예측 투표·발행된 글)이 달린 유령은 자동 삭제하지 않는다.
 * 유령이라도 회원이 찍은 투표나 이미 발행된 글이 소리 없이 사라지면 그게 더 큰 사고다.
 */
export function isDeletable(refs: { articles: number; votes: number }): boolean {
  return refs.articles === 0 && refs.votes === 0;
}
