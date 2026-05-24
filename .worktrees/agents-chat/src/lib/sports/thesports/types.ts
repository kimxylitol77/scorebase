// TheSports API (https://api.thesports.com) raw 응답 타입.
// 2026-05-18 14일 trial 시작. Production 사용 시 fixed IP worker 필수.
//
// 검증된 endpoint:
//   GET /v1/baseball/match/diary?tsp={unix}           — 특정 날짜 24h 매치
//   GET /v1/baseball/match/list?page=N | time=ts | uuid=  — 전체/증분/단건
//   GET /v1/baseball/match/detail_live               — 현재 라이브 매치 score+stats+extra
//   GET /v1/baseball/unique_tournament/list?page=N   — 토너먼트 list
//   GET /v1/baseball/player/list?page=N | uuid=      — 선수 list
//   GET /v1/baseball/match/season?uuid={season_id}   — 시즌 매치
//
// 인증: user + secret (query string)
// status_id 100 = FINISHED. 기타 코드는 docs Status Code 페이지 참조.

/** 매치 score 객체 — TheSports raw 형식 */
export interface TSScores {
  /** Full time total — [home, away] string */
  ft?: [string, string];
  /** 각 이닝 점수 (p1, p2, ... p9, p10...) — X = 안 침 */
  [pX: `p${number}`]: [string, string] | undefined;
  /** Overtime */
  ot?: [string, string];
  /** Hits */
  h?: [string, string];
  /** Errors */
  e?: [string, string];
}

/** 라이브 매치 extra 필드 — 현재 타석 상태 */
export interface TSLiveExtra {
  /** 현재 타석 스트라이크 카운트 (B/S/O 의 S) */
  good?: number;
  /** 현재 타석 볼 카운트 (B/S/O 의 B) */
  bad?: number;
  /** 주자 상황: "010" = 2루만 점유, "101" = 1·3루, "111" = 만루 */
  base?: string;
  /** 아웃 카운트 (0~2) */
  out?: number;
}

/** Match 데이터 (diary/list/season query 공통) */
export interface TSMatch {
  id: string;
  /** Competition (tournament) id — KBO=56ypq36s0o9qd7o, NPB=9k82re4svpxqepz */
  unique_tournament_id: string;
  season_id: string;
  tournament_id: string;
  home_team_id: string;
  away_team_id: string;
  /** 100=FINISHED. 진행 중/예정 코드는 docs 참조 */
  status_id: number;
  /** Unix timestamp (sec) */
  match_time: number;
  venue_id: string;
  neutral: number;
  coverage?: { mlive?: number };
  scores?: TSScores;
  description?: string;
  tbd?: number;
  weather?: {
    desc?: string;
    temp?: number;
    wind?: number;
    humidity?: number;
    pressure?: number;
  };
  updated_at: number;
}

/** results_extra 안의 unique_tournament 메타 */
export interface TSTournamentMeta {
  id: string;
  name: string;
  logo?: string;
}

/** results_extra 안의 team 메타 */
export interface TSTeamMeta {
  id: string;
  name: string;
  logo?: string;
}

/** /match/diary 응답 */
export interface TSMatchDiaryResponse {
  code: number;
  query: {
    total: number;
    type: "diary";
  };
  results: TSMatch[];
  results_extra?: {
    unique_tournament?: TSTournamentMeta[];
    team?: TSTeamMeta[];
  };
}

/** /match/list 응답 (page/time/uuid query) */
export interface TSMatchListResponse {
  code: number;
  query: {
    total: number;
    type: "page" | "time" | "uuid";
    page?: number;
    time?: number;
    uuid?: string;
    min_time?: number;
    max_time?: number;
  };
  results: TSMatch[];
}

/** /match/detail_live 단일 매치 항목 */
export interface TSDetailLiveMatch {
  id: string;
  /**
   * score 배열: [match_id, status_id, batting_team(1=home, 2=away, 0=unknown), scores_obj]
   */
  score: [string, number, number, TSScores];
  /**
   * 팀 통계: [[type(0=full, 1=inn1...), [[stat_type, home_val, away_val], ...]], ...]
   */
  stats?: Array<[number, Array<[number, number | string, number | string]>]>;
  /** 선수 통계 */
  players?: {
    home: TSPlayerStats[];
    away: TSPlayerStats[];
  };
  /** 현재 타석 상태 — 매치 종료시 빈 객체 */
  extra?: TSLiveExtra | Record<string, never>;
}

export interface TSPlayerStats {
  id: string;
  /** [[stat_type, value], ...] */
  stats: Array<[number, number | string]>;
}

/** /match/detail_live 응답 */
export interface TSDetailLiveResponse {
  code: number;
  results: TSDetailLiveMatch[];
}

/** /unique_tournament/list 응답 항목 */
export interface TSUniqueTournament {
  id: string;
  category_id: string;
  country_id: string;
  name: string;
  short_name?: string;
  logo?: string;
  cur_season_id?: string;
  uid?: string;
  updated_at: number;
}

export interface TSUniqueTournamentListResponse {
  code: number;
  query: {
    total: number;
    type: "page" | "time" | "uuid";
    page?: number;
    time?: number;
  };
  results: TSUniqueTournament[];
}

/** /player/list 응답 항목 */
export interface TSPlayer {
  id: string;
  country_id: string;
  name: string;
  short_name?: string;
  logo?: string;
  birthday?: number;
  uid?: string;
  type?: number;
  height?: number;
  weight?: number;
  position?: string;
  preferred_hand?: {
    /** 1=left, 2=right, 3=switch */
    batter?: number;
    pitcher?: number;
  };
  drafted?: {
    year?: number;
    round?: number;
    pick?: number;
    team_id?: string;
  };
  school?: {
    country_id?: string;
    name?: string;
  };
  deathday?: number;
  league_career_age?: number;
  updated_at: number;
}

/** TheSports 야구 unique_tournament_id 상수 — 2026-05-18 trial 검증 */
export const TS_BASEBALL_TOURNAMENT_ID = {
  KBO: "56ypq36s0o9qd7o",
  NPB: "9k82re4svpxqepz",
  MLB: "z8yomoys7olq0j6",
} as const;

export type TSBaseballLeague = keyof typeof TS_BASEBALL_TOURNAMENT_ID;
