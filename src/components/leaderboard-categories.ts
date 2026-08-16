// 시즌 리더보드 카테고리 정의 — LeagueLeaderBoard(클라이언트)와 서버 컴포넌트(predictions 요약)가 공유.
// "use client" 파일에서 상수를 직접 export 하면 서버 쪽 import 가 client reference 로 잡혀 분리.

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
    { key: "GOAL", label: "득점", emoji: "⚽" },
    { key: "ASSIST", label: "도움", emoji: "🎯" },
    // CHANCE·RATING·DEFENSE·SAVE 는 월드컵(실시간 playerStats 집계)만 데이터 공급 — 빅5는 탭 미노출
    { key: "CHANCE", label: "키패스", emoji: "🔑" },
    { key: "RATING", label: "평점", emoji: "⭐", decimals: 2 },
    { key: "DEFENSE", label: "수비", emoji: "🛡️" },
    { key: "SAVE", label: "세이브", emoji: "🧤" },
    { key: "YELLOW", label: "옐로", emoji: "🟨" },
    { key: "RED", label: "레드", emoji: "🟥" },
    // 이색 랭킹 (월드컵 전용 — predictions 의 별도 섹션이 이 키들만 공급)
    { key: "VALUE", label: "가성비", emoji: "💰", decimals: 1 },
    { key: "FOULED", label: "파울유도", emoji: "🤕" },
    { key: "BIGMISS", label: "빅찬스미스", emoji: "😱" },
    { key: "WOODWORK", label: "골대", emoji: "🪵" },
    { key: "AERIAL", label: "제공권%", emoji: "🎈" },
    { key: "DRIBBLE", label: "드리블%", emoji: "⚡" },
    { key: "CLINICAL", label: "결정력", emoji: "🥶" },
  ],
  // Phase 2 예정
  BASEBALL: [
    { key: "BA", label: "타율", emoji: "⚾", decimals: 3 },
    { key: "HR", label: "홈런", emoji: "💥" },
    { key: "RBI", label: "타점", emoji: "🏃" },
    { key: "ERA", label: "ERA", emoji: "🥎", decimals: 2 },
    { key: "WIN", label: "승", emoji: "🏆" },
    { key: "K", label: "탈삼진", emoji: "❌" },
  ],
  NBA: [
    { key: "PTS", label: "득점", emoji: "🏀", decimals: 1 },
    { key: "AST", label: "어시", emoji: "🎯", decimals: 1 },
    { key: "REB", label: "리바", emoji: "💪", decimals: 1 },
    { key: "STL", label: "스틸", emoji: "🦅", decimals: 1 },
    { key: "BLK", label: "블락", emoji: "🛡️", decimals: 1 },
  ],
  NHL: [
    { key: "GOAL_NHL", label: "골", emoji: "🥅" },
    { key: "ASSIST_NHL", label: "어시", emoji: "🎯" },
    { key: "POINTS", label: "포인트", emoji: "📈" },
    { key: "SAVE_PCT", label: "세이브%", emoji: "🧤", decimals: 3 },
  ],
  LOL: [
    { key: "KDA", label: "KDA", emoji: "🎮", decimals: 2 },
    { key: "CS", label: "CS", emoji: "💰", decimals: 1 },
    { key: "KILL", label: "킬", emoji: "⚔️", decimals: 1 },
  ],
  // 배구 (V-리그) — KOVO 공식 부문. 득점=시즌 총득점, 나머지는 성공률(%)·세트당 평균.
  VOLLEYBALL: [
    { key: "VB_POINTS", label: "득점", emoji: "🏐" },
    { key: "VB_ATTACK", label: "공격", emoji: "💥", decimals: 2 },
    { key: "VB_BLOCK", label: "블로킹", emoji: "🛡️", decimals: 2 },
    { key: "VB_SERVE", label: "서브", emoji: "🚀", decimals: 2 },
    { key: "VB_SET", label: "세트", emoji: "🎯", decimals: 2 },
    { key: "VB_RECEIVE", label: "리시브", emoji: "🙌", decimals: 2 },
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
