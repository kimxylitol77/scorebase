// 리더보드 카테고리 정의 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

export interface CategoryDef {
  key: string;
  label: string;
  emoji: string;
  decimals?: number; // value 표시 자릿수 (정수면 0)
}

// 종목별 카테고리 정의. league prop 으로 lookup.
export const CATEGORIES_BY_LEAGUE: Record<string, CategoryDef[]> = {
  // 축구
  SOCCER: [
    { key: "GOAL", label: "Goals", emoji: "⚽" },
    { key: "ASSIST", label: "Assists", emoji: "🎯" },
    { key: "SHOT_ON", label: "Shots on target", emoji: "🥅" },
    { key: "DRIBBLE_SUCC", label: "Dribbles", emoji: "🏃" },
    // CHANCE·RATING·DEFENSE·SAVE 는 월드컵(실시간 playerStats 집계)만 데이터 공급 — 빅5는 탭 미노출
    { key: "CHANCE", label: "Key passes", emoji: "🔑" },
    { key: "RATING", label: "Rating", emoji: "⭐", decimals: 2 },
    { key: "DEFENSE", label: "Defending", emoji: "🛡️" },
    { key: "SAVE", label: "Saves", emoji: "🧤" },
    { key: "YELLOW", label: "Yellows", emoji: "🟨" },
    { key: "RED", label: "Reds", emoji: "🟥" },
    // 이색 랭킹 (월드컵 전용 — predictions 의 별도 섹션이 이 키들만 공급)
    { key: "VALUE", label: "Value", emoji: "💰", decimals: 1 },
    { key: "FOULED", label: "Fouls won", emoji: "🤕" },
    { key: "BIGMISS", label: "Big chances missed", emoji: "😱" },
    { key: "WOODWORK", label: "Woodwork", emoji: "🪵" },
    { key: "AERIAL", label: "Aerials %", emoji: "🎈" },
    { key: "DRIBBLE", label: "Dribbles %", emoji: "⚡" },
    { key: "CLINICAL", label: "Finishing", emoji: "🥶" },
  ],
  // Phase 2 예정
  BASEBALL: [
    { key: "BA", label: "AVG", emoji: "⚾", decimals: 3 },
    { key: "HR", label: "HR", emoji: "💥" },
    { key: "RBI", label: "RBI", emoji: "🏃" },
    { key: "ERA", label: "ERA", emoji: "🥎", decimals: 2 },
    { key: "WIN", label: "Wins", emoji: "🏆" },
    { key: "K", label: "K", emoji: "❌" },
  ],
  NBA: [
    { key: "PTS", label: "Goals", emoji: "🏀", decimals: 1 },
    { key: "AST", label: "AST", emoji: "🎯", decimals: 1 },
    { key: "REB", label: "REB", emoji: "💪", decimals: 1 },
    { key: "STL", label: "STL", emoji: "🦅", decimals: 1 },
    { key: "BLK", label: "BLK", emoji: "🛡️", decimals: 1 },
  ],
  NHL: [
    { key: "GOAL_NHL", label: "Goals", emoji: "🥅" },
    { key: "ASSIST_NHL", label: "AST", emoji: "🎯" },
    { key: "POINTS", label: "Points", emoji: "📈" },
    { key: "SAVE_PCT", label: "Save %", emoji: "🧤", decimals: 3 },
  ],
  LOL: [
    { key: "KDA", label: "KDA", emoji: "🎮", decimals: 2 },
    { key: "CS", label: "CS", emoji: "💰", decimals: 1 },
    { key: "KILL", label: "Kills", emoji: "⚔️", decimals: 1 },
  ],
  // 배구 (V-리그) — KOVO 공식 부문. 득점=시즌 총득점, 나머지는 성공률(%)·세트당 평균.
  VOLLEYBALL: [
    { key: "VB_POINTS", label: "Goals", emoji: "🏐" },
    { key: "VB_ATTACK", label: "Attack", emoji: "💥", decimals: 2 },
    { key: "VB_BLOCK", label: "Blocks", emoji: "🛡️", decimals: 2 },
    { key: "VB_SERVE", label: "Serve", emoji: "🚀", decimals: 2 },
    { key: "VB_SET", label: "Set", emoji: "🎯", decimals: 2 },
    { key: "VB_RECEIVE", label: "Receive", emoji: "🙌", decimals: 2 },
  ],
};

export const LEAGUE_TO_SPORT: Record<string, keyof typeof CATEGORIES_BY_LEAGUE> = {
  EPL: "SOCCER",
  LALIGA: "SOCCER",
  BUNDESLIGA: "SOCCER",
  SERIE_A: "SOCCER",
  LIGUE_1: "SOCCER",
  MLS: "SOCCER",
  UCL: "SOCCER",
  WORLD_CUP: "SOCCER",
  KBO: "BASEBALL",
  NPB: "BASEBALL",
  MLB: "BASEBALL",
  NBA: "NBA",
  // KBL/WKBL — NBA 와 같은 평균 스탯 카테고리(PTS/AST/REB/STL/BLK) 재사용
  KBL: "NBA",
  WKBL: "NBA",
  NHL: "NHL",
  LOL: "LOL",
  V_LEAGUE: "VOLLEYBALL",
  V_LEAGUE_W: "VOLLEYBALL",
};
