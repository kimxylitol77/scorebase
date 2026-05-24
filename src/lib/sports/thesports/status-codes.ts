// TheSports 야구 status_id → 우리 MatchStatus 매핑.
//
// 검증 (2026-05-18 → 2026-05-24):
//   100 = 종료 (FT)
//   1~99 = 이닝/플레이 진행
//   415/417/418 = LIVE 진행 (2026-05-24 KBO 5경기 cache score[1] 관측)
//   400대 전반을 LIVE 로 통합 (이닝/half 별 세부 코드 추정)

import type { MatchStatus } from "../types";

export function mapBaseballStatus(statusId: number): MatchStatus {
  if (statusId === 100) return "FINISHED";
  if (statusId >= 1 && statusId < 100) return "LIVE";
  if (statusId >= 400 && statusId < 500) return "LIVE";
  if (statusId >= 200 && statusId < 300) return "SCHEDULED";
  if (statusId >= 300 && statusId < 400) return "POSTPONED";
  return "SCHEDULED";
}

/**
 * 추후 docs 확인 후 정확한 매핑으로 교체.
 * 화요일 5/19 라이브 매치 받으면 진행 중 매치의 status_id 확인.
 */
