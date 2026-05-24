// TheSports football competition_id 매핑 — 우리 League 코드 ↔ TheSports id.
//
// 2026-05-18 trial 검증: 5/10~5/17 7일치 /match/diary fetch 로 35개 매핑 확정.
// 매핑 안 된 56개 (UCL/UEL/COPA_LIB 등 비시즌)는 시즌 시작 후 추가.
// 또는 영업이 /v1/football/unique_tournament/list 권한 활성화하면 한 번에 보강.

import type { League } from "../types";

/**
 * scorebase League → TheSports competition_id.
 * 매핑 안 된 리그는 undefined 반환 — TheSports collector 사용 불가.
 */
export const TS_FOOTBALL_COMPETITION_ID: Partial<Record<League, string>> = {
  // Top 5 + 2부
  EPL: "jednm9whz0ryox8",
  LALIGA: "vl7oqdehlyr510j",
  BUNDESLIGA: "gy0or5jhg6qwzv3",
  SERIE_A: "4zp5rzghp5q82w1",
  LIGUE_1: "yl5ergphnzr8k0o",
  CHAMPIONSHIP: "l965mkyh32r1ge4",
  BUNDESLIGA_2: "kn54qllhjzqvy9d",
  SERIE_B: "j1l4rjnhx9m7vx5",
  LIGUE_2: "kjw2r09hw8rz84o",
  // 유럽 기타
  EREDIVISIE: "vl7oqdeheyr510j",
  PRIMEIRA_LIGA: "9vjxm8ghx2r6odg",
  JUPILER_PL: "9vjxm8gh22r6odg",
  SPL: "p4jwq2gh1gm0veo",
  GREEK_SL: "e4wyrn4hoeq86pv",
  AUSTRIA_BL: "yl5ergphyvr8k0o",
  EKSTRAKLASA: "vl7oqdeh3lr510j",
  POLAND_1L: "kdj2ryohx2q1zpg",
  LIGA_I: "kdj2ryohe2q1zpg",
  MOLDOVA_SL: "e4wyrn4hw7q86pv",
  UKRAINE_PL: "gx7lm7ph7jm2wdk",
  DENMARK_SL: "4zp5rzgh0eq82w1",
  // 북유럽
  ELITESERIEN: "gy0or5jhj6qwzv3",
  ALLSVENSKAN: "l965mkyhg0r1ge4",
  VEIKKAUSLIIGA: "z8yomo4h92q0j6l",
  // 아시아
  K_LEAGUE_1: "gy0or5jhlxgqwzv",
  K_LEAGUE_2: "kn54qllh25dqvy9",
  J1_LEAGUE: "z318q66hl1qo9jd",
  SAUDI_PL: "j1l4rjnh66nm7vx",
  A_LEAGUE: "9k82rekhvz2repz",
  INDONESIA_L1: "56ypq3nhz53md7o",
  // 북중남미
  MLS: "kn54qllhg2qvy9d",
  LIGA_MX: "9k82rekhp6repzj",
  BRASILEIRAO: "4zp5rzgh9zq82w1",
  PERU_PD: "vl7oqdehwxr510j",
  USA_USL_CH: "d23xmvkh1oqg8ny",
};

/**
 * TheSports competition_id → 우리 League. 역인덱스.
 * Football collector 가 응답 매치를 우리 League 로 분류할 때 사용.
 */
export const TS_FOOTBALL_LEAGUE_BY_COMPETITION: Record<string, League> = Object.fromEntries(
  Object.entries(TS_FOOTBALL_COMPETITION_ID).map(([league, id]) => [id, league as League]),
);

/** 우리 League 가 TheSports 매핑됐는지 확인 */
export function hasFootballMapping(league: League): boolean {
  return league in TS_FOOTBALL_COMPETITION_ID;
}

/** 매핑 안 된 우리 League — 시즌 시작 후 보강 필요 */
export const UNMAPPED_FOOTBALL_LEAGUES_NOTE = `
2026-05-18 trial 시점 매핑 안 된 56개 우리 리그 — 5월 비시즌 또는 다른 요일:
- 유럽 컵: UCL, UEL, UECL (9월~5월, 5월에 결승만)
- 아시아 컵: AFC_CL, AFC_CL_TWO, AFC_U23
- 남미 컵: COPA_LIB, COPA_SUD (6월~12월)
- 2부 일부: LALIGA_2
- 북유럽 2부: NORWAY_1L, SUPERETTAN, YKKONEN, ICELAND_1L, URVALSDEILD
- 동유럽: CZECH_L, HNL, HUNGARY_NB1, SERBIA_SL, SLOVAKIA_SL, SLOVENIA_SNL, CYPRUS_1D, BULGARIA_PL, ARMENIA_PL
- 발칸: IRELAND_PD, BOSNIA_PL, ALBANIA_SL
- 스위스: SWISS_SL, CHALLENGE_LEAGUE
- 터키/벨기에 일부: SUPER_LIG (5월 비시즌)
- 일본: J2_LEAGUE
- 중국: CSL
- 남미: CHILE_PD, CHILE_PB, ECUADOR_LP, COLOMBIA_PA, VENEZUELA_PD
- 중동·아프리카: EGYPT_PL, ISRAEL_PL, MOROCCO_BP, SOUTHAFRICA_PSL, UAE_PL, QATAR_SL
- 동남아: INDIA_ISL, VIETNAM_VL1, SINGAPORE_PL
- 캐나다: CANADA_PL
- 세계대회: WORLD_CUP, CLUB_WORLD_CUP
- 브라질 2부: 없음 (우리 BRASILEIRAO 만 1부)

해결책:
1) 영업에 /v1/football/unique_tournament/list 권한 활성화 요청 — 1970+ 리그 한 번에
2) 또는 시즌 시작될 때 (8월/9월) /match/diary 재호출로 매핑 보강
`;
