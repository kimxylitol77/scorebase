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
