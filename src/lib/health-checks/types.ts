// Health-check 봇 공통 타입.

export type HealthSeverity = "HIGH" | "MED" | "LOW" | "OK";

export interface HealthFinding {
  /** 카테고리 — season-label / match-count / accuracy 등. */
  category: string;
  /** 세부 키 — 리그 코드, 잡 이름 등. */
  key: string;
  severity: HealthSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}

/** 모든 체크 함수의 공통 시그니처. 발견된 issue 들 배열 반환. issue 없으면 빈 배열. */
export type HealthCheckFn = () => Promise<HealthFinding[]>;
