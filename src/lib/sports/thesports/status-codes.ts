// TheSports 야구 status_id → 우리 MatchStatus 매핑.
//
// 검증 (2026-05-18 → 2026-05-27):
//   0, 1 = 시작 전 (Not Started) — 5/27 CPBL/LMB 미시작 매치 59건 + 5/28 미래 매치
//   100 = 종료 (FT)
//   415/417/418/432~437 = LIVE 진행 (KBO + CPBL cache score[1] 관측)
//   400대 전반을 LIVE 로 통합 (이닝/half 별 세부 코드 추정)
//   14, 19 = 과거 매치 일부 (취소/포기 추정, 소수)

import type { MatchStatus } from "../types";

export function mapBaseballStatus(statusId: number): MatchStatus {
  if (statusId === 0 || statusId === 1) return "SCHEDULED"; // Not Started
  if (statusId === 100) return "FINISHED";
  if (statusId >= 2 && statusId < 100) return "LIVE";
  if (statusId >= 400 && statusId < 500) return "LIVE";
  if (statusId >= 200 && statusId < 300) return "SCHEDULED";
  if (statusId >= 300 && statusId < 400) return "POSTPONED";
  return "SCHEDULED";
}

/**
 * 추후 docs 확인 후 정확한 매핑으로 교체.
 * 화요일 5/19 라이브 매치 받으면 진행 중 매치의 status_id 확인.
 */

// TheSports ice_hockey status_id → 우리 MatchStatus.
// 코드 표 = TheSports docs (2026-05-28 사용자 제공). 야구 스킴과 완전히 다름.
//   SCHEDULED: 0(ABNORMAL/hide), 1(NOT_STARTED), 15(DELAYED), 99(TBD)
//   LIVE:      30/31/32(P1/P2/P3), 331/332(P1/P2 인터미션), 6/10(OT 대기/진행),
//              8/13(SO 대기/진행), 17(INTERRUPTED)
//   FINISHED:  100(ENDED), 105(AFTER_OT), 110(AFTER_PENALTIES), 19(Cut in half)
//   POSTPONED: 14(POSTPONED), 16(CANCELED)
const ICE_HOCKEY_LIVE = new Set([30, 331, 31, 332, 32, 6, 10, 8, 13, 17]);
const ICE_HOCKEY_FINISHED = new Set([100, 105, 110, 19]);
const ICE_HOCKEY_POSTPONED = new Set([14, 16]);

export function mapIceHockeyStatus(statusId: number): MatchStatus {
  if (ICE_HOCKEY_FINISHED.has(statusId)) return "FINISHED";
  if (ICE_HOCKEY_LIVE.has(statusId)) return "LIVE";
  if (ICE_HOCKEY_POSTPONED.has(statusId)) return "POSTPONED";
  // 0/1/15/99 + 미지 코드 → SCHEDULED (보수: 가짜 LIVE/FINISHED 방지)
  return "SCHEDULED";
}
