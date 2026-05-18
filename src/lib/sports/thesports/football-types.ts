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

// ============================================================
// 추가 endpoint 응답 타입 (2026-05-18 trial)
// ============================================================

/** 단일 경기 라인업 — /v1/football/match/lineup/detail?uuid={match_id} */
export interface TSFootballLineupResponse {
  code: number;
  results: {
    confirmed: number; // 1=공식 라인업
    home_formation: string; // "4-3-3"
    away_formation: string;
    coach_id: { home: string; away: string };
    lineup: {
      home: TSFootballLineupPlayer[];
      away: TSFootballLineupPlayer[];
    };
    injury: {
      home: TSFootballInjuryEntry[];
      away: TSFootballInjuryEntry[];
    };
  };
}

export interface TSFootballLineupPlayer {
  id: string;
  first: number; // 1=선발
  captain: number; // 1=주장
  name: string;
  logo?: string;
  shirt_number: number;
  /** F-forward, M-midfielder, D-defender, G-goalkeeper */
  position: string;
  /** x 좌표 (0~100), home 기준 좌상단 origin */
  x: number;
  /** y 좌표 (0~100) */
  y: number;
  /** 평점 (full score 10) — string 형식 */
  rating: string;
  incidents?: TSFootballPlayerIncident[];
}

export interface TSFootballPlayerIncident {
  type: number; // status code Technical Statistics 참조
  time: string; // "45+2" 같은 형식
  minute: number;
  addtime: number;
  belong: number; // 0=중립, 1=home, 2=away
  home_score?: number;
  away_score?: number;
  player?: { id: string; name: string };
  assist1?: { id: string; name: string };
  assist2?: { id: string; name: string };
  in_player?: { id: string; name: string };
  out_player?: { id: string; name: string };
}

export interface TSFootballInjuryEntry {
  id: string;
  name: string;
  position: string;
  logo?: string;
  /** 0=unknown, 1=injured, 2=suspended, 3=questionable */
  type: number;
  reason: string;
  start_time?: number;
  end_time?: number;
  missed_matches?: number;
}

/** 경기팀 통계 — URL placeholder (영업 받기 대기) */
export interface TSFootballMatchTeamStatsResponse {
  code: number;
  results: Array<{
    id: string;
    stats: Array<{
      team_id: string;
      goals: number;
      penalty: number;
      assists: number;
      red_cards: number;
      yellow_cards: number;
      shots: number;
      shots_on_target: number;
      dribble: number;
      dribble_succ: number;
      clearances: number;
      blocked_shots: number;
      interceptions: number;
      tackles: number;
      passes: number;
      passes_accuracy: number;
      key_passes: number;
      crosses: number;
      crosses_accuracy: number;
      long_balls: number;
      long_balls_accuracy: number;
      duels: number;
      duels_won: number;
      fouls: number;
      was_fouled: number;
      goals_against: number;
      offsides: number;
      yellow2red_cards: number;
      corner_kicks: number;
      /** 점유율 % */
      ball_possession: number;
      freekicks: number;
      freekick_goals: number;
      hit_woodwork: number;
      fastbreaks: number;
      fastbreak_shots: number;
      fastbreak_goals: number;
      poss_losts: number;
      aerial_won: number;
      aerial_lost: number;
      duel_won?: number;
      duel_lost?: number;
    }>;
  }>;
}

/** 경기 선수 통계 — URL placeholder */
export interface TSFootballMatchPlayerStatsResponse {
  code: number;
  results: Array<{
    id: string;
    player_stats: Array<{
      player_id: string;
      team_id: string;
      first: number;
      goals: number;
      assists: number;
      penalty: number;
      minutes_played: number;
      red_cards: number;
      yellow_cards: number;
      shots: number;
      shots_on_target: number;
      dribble: number;
      dribble_succ: number;
      clearances: number;
      blocked_shots: number;
      interceptions: number;
      tackles: number;
      passes: number;
      passes_accuracy: number;
      key_passes: number;
      crosses: number;
      crosses_accuracy: number;
      duels: number;
      duels_won: number;
      dispossessed: number;
      fouls: number;
      was_fouled: number;
      offsides: number;
      saves: number;
      /** 평점 (full 10) */
      rating: number;
      aerial_won: number;
      aerial_lost: number;
    }>;
  }>;
}

/** H2H — URL placeholder */
export interface TSFootballH2HResponse {
  code: number;
  results: {
    info: TSFootballMatchInfoArray;
    history: {
      vs: TSFootballMatchInfoArray[];
      home: TSFootballMatchInfoArray[];
      away: TSFootballMatchInfoArray[];
    };
    future: {
      home: TSFootballMatchInfoArray[];
      away: TSFootballMatchInfoArray[];
    };
    goal_distribution: {
      home: TSFootballGoalDistribution;
      away: TSFootballGoalDistribution;
    };
  };
}

/**
 * Match info array — 압축 형식.
 * [match_id, comp_id, status, time, kickoff, [home_team_arr], [away_team_arr],
 *  [odds_arr], [desc_arr], [season_arr]]
 */
export type TSFootballMatchInfoArray = unknown[];

export interface TSFootballGoalDistribution {
  all: TSFootballGoalDistributionSeg;
  home: TSFootballGoalDistributionSeg;
  away: TSFootballGoalDistributionSeg;
}

export interface TSFootballGoalDistributionSeg {
  matches: number;
  /** 6 segments × [number, percentage, start_min, end_min] (15분 단위) */
  scored: Array<[number, number, number, number]>;
  conceded: Array<[number, number, number, number]>;
}

/** 시즌 순위 — URL placeholder, 응답 구조 미확인 */
export interface TSFootballStandingsResponse {
  code: number;
  results: unknown; // 구조 확인 후 정정
}

/** 시즌별 팀 통계 — /v1/football/season/recent/team/stat?uuid={season_id} */
export interface TSFootballSeasonTeamStatResponse {
  code: number;
  results: Array<{
    team: { id: string; name: string; logo?: string };
    matches: number;
    goals: number;
    penalty: number;
    assists: number;
    red_cards: number;
    yellow_cards: number;
    shots: number;
    shots_on_target: number;
    dribble: number;
    dribble_succ: number;
    clearances: number;
    blocked_shots: number;
    tackles: number;
    passes: number;
    passes_accuracy: number;
    key_passes: number;
    crosses: number;
    crosses_accuracy: number;
    long_balls: number;
    long_balls_accuracy: number;
    duels: number;
    duels_won: number;
    fouls: number;
    was_fouled: number;
    goals_against: number;
    interceptions: number;
    offsides: number;
    yellow2red_cards: number;
    corner_kicks: number;
    ball_possession: number;
    freekicks: number;
    freekick_goals: number;
    hit_woodwork: number;
    fastbreaks: number;
    fastbreak_shots: number;
    fastbreak_goals: number;
    poss_losts: number;
    saves: number;
    penalty_conceded: number;
    updated_at: number;
  }>;
}

/** 시즌별 선수 통계 — /v1/football/season/recent/player/stat?uuid={season_id} */
export interface TSFootballSeasonPlayerStatResponse {
  code: number;
  results: Array<{
    player: {
      id: string;
      name: string;
      logo?: string;
      position: string;
      country_id?: string;
      nationality?: string;
    };
    team: { id: string; name: string; logo?: string };
    matches: number;
    court: number;
    first: number;
    goals: number;
    penalty: number;
    assists: number;
    minutes_played: number;
    red_cards: number;
    yellow_cards: number;
    shots: number;
    shots_on_target: number;
    /** 평점 — x100 stored. 평균 = rating/court/100 */
    rating: number;
    big_chance_created?: number;
    big_chance_missed?: number;
    updated_at: number;
  }>;
}

/** 시즌 득점왕 — /v1/football/season/recent/shooter/stat?uuid={season_id} */
export interface TSFootballSeasonShooterResponse {
  code: number;
  results: Array<{
    /** 순위 */
    position: number;
    player: {
      id: string;
      name: string;
      logo?: string;
      position: string;
      country_id?: string;
      nationality?: string;
    };
    team: { id: string; name: string; logo?: string };
    goals: number;
    penalty: number;
    assists: number;
    minutes_played: number;
    updated_at: number;
  }>;
}
