// Predictions 모듈 공통 타입.
// DB Match 모델에서 필요한 필드만 추린 형태.

export interface PredictMatch {
  id: number;
  league: string;
  status: string; // FINISHED | SCHEDULED | LIVE | POSTPONED
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  startTime: Date;
  /** 기대득점 (af fixtureStats) — 있으면 Elo 가 xG 혼합 마진으로 업데이트 (xG-Elo).
   *  빅5·MLS·브라질레이랑만 제공, 없으면 기존 골 마진과 100% 동일 동작. */
  xgHome?: number | null;
  xgAway?: number | null;
}

export type FormResult = "W" | "D" | "L";
