// /standings/[league] 지원 리그 집합 — 단일 정의.
// standings 페이지의 라우팅 게이트 + /predictions/[league] 의 "시뮬 미지원 리그 redirect 가능?"
// 판정이 같은 집합을 봐야 해서 lib 로 분리 (page.tsx 는 임의 export 불가).

import { SOCCER_LEAGUES, VOLLEYBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export const STANDINGS_VALID = new Set<string>([
  ...SOCCER_LEAGUES,
  ...VOLLEYBALL_LEAGUES,
  "NBA",
  "WNBA",
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
