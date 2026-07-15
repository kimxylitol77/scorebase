// 검색 "기회 검색어" 판정·점수화 (구글 GSC · 빙 Webmaster 공용).
// 노출(검색 수요)은 있는데 순위가 낮아 클릭을 못 받는 검색어 = 콘텐츠/메타 보강 시
// 순위·클릭을 끌어올릴 1순위 타겟. UI(/admin/stats)·주간 SEO 점검 job 이 같은 기준을 쓴다.

// 노출이 이만큼은 돼야 실제 검색 수요로 인정 (저노출은 노이즈).
export const OPP_MIN_IMPRESSIONS = 10;
// 이 순위 밖이면 클릭을 거의 못 받음 (4위 밖 = 1페이지 하단~아래).
export const OPP_MIN_POSITION = 4;
// 이 순위보다 더 낮으면 보강해도 단기 상위 진입이 어려워 타겟에서 제외.
export const OPP_MAX_POSITION = 30;

// 상위(약 3위권) 진입 시 기대 CTR 근사치 — 놓친 클릭(잠재력) 추정용.
// 정밀한 값이 아니라 검색어 간 상대 우선순위를 매기기 위한 상수.
const TARGET_CTR = 0.1;

/** 기회 검색어 판정 — 노출 충분 + 순위가 보강 가치 구간(4~30위) 안. */
export function isOpportunity(r: { impressions: number; position: number }): boolean {
  return (
    r.impressions >= OPP_MIN_IMPRESSIONS &&
    r.position >= OPP_MIN_POSITION &&
    r.position <= OPP_MAX_POSITION
  );
}

/** 상위 진입 가정 시 추가로 얻을 수 있는 클릭 추정 = 노출×기대CTR − 현재클릭 (하한 0). */
export function potentialClicks(impressions: number, clicks: number): number {
  return Math.max(0, Math.round(impressions * TARGET_CTR) - clicks);
}

/** 잠재 클릭 내림차순 정렬 비교자 — 동률이면 노출 많은 순. */
export function byPotentialDesc(
  a: { impressions: number; clicks: number },
  b: { impressions: number; clicks: number },
): number {
  return (
    potentialClicks(b.impressions, b.clicks) - potentialClicks(a.impressions, a.clicks) ||
    b.impressions - a.impressions
  );
}
