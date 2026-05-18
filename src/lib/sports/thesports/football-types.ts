// TheSports football API 응답 raw 타입.
// Baseball 과 응답 구조 다름:
//   - tournament 키: baseball=unique_tournament_id, football=competition_id
//   - score: baseball=scores.ft/p1/h/e, football=home_scores[]/away_scores[] (array of int)
//   - results_extra: baseball=unique_tournament/team, football=competition/team/referee/venue/season/stage

/**
 * Football match score 배열.
 * 인덱스 의미는 docs Status Code 페이지 참조 — 추정:
 *   [0] = 정규시간 종합 (full time)
 *   [1] = 1st half
 *   [2] = 2nd half
 *   [3], [4], [5], [6] = corners / shots / extra time / penalty shootout 등
 */
export type TSFootballScores = number[];

export interface TSFootballMatch {
  id: string;
  season_id: string;
  /** TheSports football tournament id — baseball 의 unique_tournament_id 와 동치 */
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  /** Match status — docs Status Code 페이지 참조. baseball 과 코드 다를 수 있음 */
  status_id: number;
  /** Unix timestamp (sec) */
  match_time: number;
  venue_id: string;
  referee_id?: string;
  neutral: number;
  note?: string;
  /**
   * [정규시간, 1st half, 2nd half, 코너?, 슈팅?, ...] — 인덱스 의미 docs 참조
   */
  home_scores?: TSFootballScores;
  away_scores?: TSFootballScores;
  home_position?: string;
  away_position?: string;
  coverage?: {
    mlive?: number;
    lineup?: number;
    gif?: number;
  };
  round?: {
    stage_id?: string;
    round_num?: number;
    group_num?: number;
  };
  environment?: {
    weather?: number;
    pressure?: string;
    temperature?: string;
    wind?: string;
    humidity?: string;
  };
  /** Match end timestamp (sec) */
  ended?: number;
  updated_at: number;
}

export interface TSFootballCompetitionMeta {
  id: string;
  category_id?: string;
  country_id?: string;
  name: string;
  short_name?: string;
  logo?: string;
  cur_season_id?: string;
  uid?: string;
  updated_at?: number;
}

export interface TSFootballTeamMeta {
  id: string;
  name: string;
  short_name?: string;
  logo?: string;
  country_id?: string;
  updated_at?: number;
}

export interface TSFootballRefereeMeta {
  id: string;
  name?: string;
  country_id?: string;
}

export interface TSFootballVenueMeta {
  id: string;
  name?: string;
  city?: string;
  capacity?: number;
}

export interface TSFootballSeasonMeta {
  id: string;
  year?: string;
  competition_id?: string;
}

export interface TSFootballStageMeta {
  id: string;
  name?: string;
  competition_id?: string;
}

export interface TSFootballMatchDiaryResponse {
  code: number;
  query: {
    total: number;
    type: "diary";
  };
  results: TSFootballMatch[];
  results_extra?: {
    competition?: TSFootballCompetitionMeta[];
    team?: TSFootballTeamMeta[];
    referee?: TSFootballRefereeMeta[];
    venue?: TSFootballVenueMeta[];
    season?: TSFootballSeasonMeta[];
    stage?: TSFootballStageMeta[];
  };
}
