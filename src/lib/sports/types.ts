// 스포츠 데이터 공통 타입 — 모든 데이터 소스(api-football, MySportsFeeds 등)
// 의 응답을 이 형태로 정규화해서 처리한다.

export type League =
  | "KBO"
  | "EPL"
  | "NBA"
  | "NHL"
  | "MLB"
  | "LALIGA"
  | "BUNDESLIGA"
  | "SERIE_A"
  | "LIGUE_1"
  | "MLS"
  | "UCL"
  | "WORLD_CUP"; // 2026 FIFA 북중미 월드컵

/** 축구 리그(다중 리그 컬렉터에서 분기용) */
export const SOCCER_LEAGUES = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
] as const satisfies readonly League[];

export type MatchStatus =
  | "SCHEDULED" // 예정
  | "LIVE" // 진행 중
  | "FINISHED" // 종료
  | "POSTPONED"; // 연기

export interface NormalizedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
}

export interface NormalizedMatch {
  league: League;
  externalId: string;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  startTime: Date;
  raw: unknown; // 원본 응답 (디버깅/추가 정보 추출용)
}

export interface MatchCollector {
  readonly league: League;
  /** 특정 날짜의 경기 목록 가져오기 (YYYY-MM-DD) */
  fetchByDate(date: string): Promise<NormalizedMatch[]>;
}
