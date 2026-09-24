// AFCON 2027 예선 조별리그 규칙 — 조 글자·개최국·확정 구역.
// 규정(CAF 공식): 12개 조 × 4팀, 6라운드(9~10월 1·2R / 11월 3·4R / 2027년 3월 5·6R).
// 개최국이 없는 조는 1·2위 진출. 공동개최국 케냐(D)·우간다(H)·탄자니아(L)는 성적과 무관하게
// 자동 진출하고, 그 조에선 개최국을 뺀 최상위 1팀만 진출한다. prisma 없음(테스트용).

export const AFCON_MATCHDAYS = 6;

/** 공동개최국 — af/ts 영문 팀명 기준 */
export const AFCON_HOSTS: ReadonlySet<string> = new Set(["Kenya", "Uganda", "Tanzania"]);

/** ts 조 번호 순서(1~12) → A~L. 개최국 위치(D·H·L)로 순서가 공식 조와 같음을 확인했다(2026-09-24). */
export function afconGroupLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

export type AfconZone = "host" | "qualify" | null;

/**
 * 한 팀의 확정 구역.
 * - 개최국은 경기 전이라도 자동 진출이 확정이다.
 * - 나머지는 조에서 한 경기라도 치른 뒤에만 칠한다(개막 전 순서는 임의).
 * - 개최국이 있는 조는 개최국을 뺀 최상위 1팀, 없는 조는 1·2위.
 */
export function afconZone(opts: {
  isHost: boolean;
  position: number;
  groupHasHost: boolean;
  groupPlayed: boolean;
  /** 개최국을 뺀 팀 중 가장 좋은 순위 — 개최국 조에서만 쓴다 */
  bestNonHostPosition: number;
}): AfconZone {
  if (opts.isHost) return "host";
  if (!opts.groupPlayed) return null;
  if (opts.groupHasHost) return opts.position === opts.bestNonHostPosition ? "qualify" : null;
  return opts.position <= 2 ? "qualify" : null;
}
