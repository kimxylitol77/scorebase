// TheSports 야구 status_id → 우리 MatchStatus 매핑.
//
// 2026-05-18 trial 검증:
//   100 = 종료된 매치 (detail_live 응답 전체 status=100)
//
// 다른 코드 (LIVE, SCHEDULED, POSTPONED 등) 는 docs "STATUS CODE" 페이지에서 확인 필요.
// 화요일 5/19 KBO 라이브 시작 후 응답 보고 추가 매핑.

import type { MatchStatus } from "../types";

/**
 * TheSports 야구 status_id → 우리 MatchStatus.
 * 미확정 코드는 일단 SCHEDULED 로 fallback.
 */
export function mapBaseballStatus(statusId: number): MatchStatus {
  // 종료 그룹 — 100 검증됨, 다른 종료 코드도 fallthrough
  if (statusId === 100) return "FINISHED";
  // 진행 중 그룹 (예상 — docs status code 확인 후 정정 필요)
  //   1~9 = 이닝 진행 추정 (1st~9th inning live)
  //   10~99 = 다양한 live state
  if (statusId >= 1 && statusId < 100) return "LIVE";
  // 예정/연기 그룹 (200대 이상으로 추정 — 미확정)
  if (statusId === 200 || statusId === 201 || statusId === 202) return "SCHEDULED";
  if (statusId === 300 || statusId === 301) return "POSTPONED";
  // 기본 fallback
  return "SCHEDULED";
}

/**
 * 추후 docs 확인 후 정확한 매핑으로 교체.
 * 화요일 5/19 라이브 매치 받으면 진행 중 매치의 status_id 확인.
 */
