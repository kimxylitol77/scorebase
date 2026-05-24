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
}

export type FormResult = "W" | "D" | "L";
