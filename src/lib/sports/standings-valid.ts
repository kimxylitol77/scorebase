// /standings/[league] 지원 리그 집합 — 단일 정의.
// standings 페이지의 라우팅 게이트 + /predictions/[league] 의 "시뮬 미지원 리그 redirect 가능?"
// 판정이 같은 집합을 봐야 해서 lib 로 분리 (page.tsx 는 임의 export 불가).

import { SOCCER_LEAGUES, VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const STANDINGS_VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  ...VOLLEYBALL_LEAGUES,
  "NBA",
  "WNBA",
  "KBL",
  "WKBL",
  "NHL",
  "KBO",
  "NPB",
  "MLB",
  "CPBL",
  "LOL",
  "LEC",
  "LCS",
  "LPL",
  "EWC",
]);

// 순위표가 의미 없는 대회 — 조별리그 없는 녹아웃 컵 + 친선.
// (FA컵처럼 96팀이 1경기씩 치른 표가 나옴). /standings 인덱스 노출 제외 + 순위 링크 노출 제외의 단일 정의.
// 조별리그가 있는 UCL·UEL·UECL·COPA_LIB·WC_QUAL 등은 순위가 의미 있어 여기 넣지 않는다.
export const NO_TABLE_LEAGUES = new Set<string>([
  "FA_CUP", "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA", "DFB_POKAL",
  "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "LEVAIN_CUP", "SUI_CUP", "SVENSKA_CUPEN",
  "COPA_DO_BRASIL", "PORTUGAL_SUPER_CUP", "CONCACAF_CCUP", "AFC_CUP", "LEAGUES_CUP",
  // 2026-08-21 추가 — 빅5 슈퍼컵 (ts 단독 수집 · 자세한 근거는 reports/plans/big5-super-cups/)
  "COMMUNITY_SHIELD", "SUPERCOPA_ESPANA", "DFL_SUPERCUP", "SUPERCOPPA_ITALIANA", "TROPHEE_DES_CHAMPIONS",
  "CANADA_CHAMP", "CLUB_FRIENDLY", "INTL_FRIENDLY",
]);

/** 리그 순위표 링크를 걸어도 되는가 — 라우팅 지원 + 순위가 의미 있는 대회. */
export function hasStandingsTable(league: string): boolean {
  return STANDINGS_VALID.has(league) && !NO_TABLE_LEAGUES.has(league);
}
