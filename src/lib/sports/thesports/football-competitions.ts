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
  URVALSDEILD: "kn54qllhp3qvy9d",
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
  // 2026-05-24 추가 (3차) — match/recent/list 988 매치 분석으로 식별
  LEAGUE_ONE: "8y39mp1hjzmojxg",
  LEAGUE_TWO: "9k82rekhygrepzj",
  NATIONAL_LEAGUE: "z318q66hv8qo9jd",
  SCOT_CHAMPIONSHIP: "jednm9wheoryox8",
  // 2026-08-01 스왑: ts 가 두 대회의 소속 클럽을 뒤바꿔 제공 — 8y39... 에 실제 리그투 클럽
  // (Annan·Clyde·Stirling 등), l965... 에 실제 리그원 클럽(Ross County·Alloa·Peterhead 등)이
  // 들어있음(위키 2026-27 League One 대조·af/7m 과 일치). 우리 쪽에서 보정 스왑.
  // ⚠️ ts 가 업스트림을 고치면 다시 뒤집힘 — standings_mismatch 알림 뜨면 이 줄 1순위 확인.
  SCOT_LEAGUE_ONE: "l965mkyhz0r1ge4",
  SCOT_LEAGUE_TWO: "8y39mp1h98mojxg",
  RPL: "8y39mp1hwxmojxg",
  // 2026-08-02 추가 (17개) — 7m 대조 확장 리그 ts 승격. competition/additional/list 실측
  // (cur_season_id 검증 게이트 통과: 신시즌 표 10 + 컵 2 + 연중시즌 5). 사용자 지시 = ts 1순위.
  // 스웨덴 에탄·노르웨이 2.디비션·핀란드 카코넨은 ts 구조 불일치(단일대회/미발굴/시즌없음) — af orphan 유지.
  WALES_PL: "gpxwrxlh5nryk0j",
  MONTENEGRO_1L: "z8yomo4h81q0j6l",
  LUXEMBOURG_ND: "d23xmvkh2nqg8ny",
  FAROE_PL: "j1l4rjnhgvm7vx5",
  PANAMA_LPF: "p4jwq2ghk3dm0ve",
  ELSALVADOR_PD: "9k82rekhk6repzj",
  NICARAGUA_PD: "p3glrw7hjk4qdyj",
  COPA_DO_BRASIL: "z8yomo4hooq0j6l",
  PORTUGAL_SUPER_CUP: "j1l4rjnhe9m7vx5",
  RUSSIA_FNL: "9k82rekh6lrepzj",
  ROMANIA_L2: "v2y8m4zhw4ql074",
  COSTA_RICA_PD: "jednm9whneryox8",
  GUATEMALA_LN: "8y39mp1hlpmojxg",
  HONDURAS_LN: "4zp5rzghkzq82w1",
  UZBEKISTAN_SL: "kdj2ryohkgyq1zp",
  MEXICO_2: "z318q66hygqo9jd",
  CHINA_3: "9dn1m1gh5gmoepl",
  ALGERIA_L1: "kdj2ryohk2dq1zp",
  // z318q66h7yqo9jd 는 Sweden Division 2 였음 — 실제 스벤스카 컵은 ts "Sweden Cup" (2026-08-03 교정).
  SVENSKA_CUPEN: "vl7oqdehdyr510j",
  GHANA_PL: "z318q66howkqo9j",
  // 2026-08-02 — 스위스 1·2부 백스톱 등록. 워커 diary push 는 이미 SWISS_SL ts- 매치를
  // 만들고 있었으나(7월 11/11) collect 백스톱 매핑이 빠져 주석의 "미매핑 56개" 목록에
  // 남아 있었다. league-id-mapping 의 확정 tsId 그대로 — 등록만으로 추가 af 콜 없음.
  SWISS_SL: "z8yomo4hx9q0j6l",
  CHALLENGE_LEAGUE: "56ypq3nheemd7oj",
  // 2026-08-01 — ASEAN 챔피언십(시니어 A매치, 옛 AFF 미쓰비시컵) ts 승격.
  // af 전용이라 골/카드 incidents·라인업 좌표가 전무하던 원인 (competition/additional/list 실측:
  // lineup confirmed 23명·팀 stats 제공 확인). cur_season_id = jw2r09hl43erz84.
  ASEAN_CHAMP: "v2y8m4zhodql074",
  // 2026-05-25 추가 (남미 3개 + NWSL) — ts diary discovery 로 확정
  // ARG_PRIMERA_NACIONAL 은 이전에 p3glrw7hevqdyjv 로 잘못 매핑돼 있었음 (실제는 1부 = ARGENTINA_PL).
  // ARG_PRIMERA_NACIONAL 진짜 ID 는 별도 발굴 필요.
  ARGENTINA_PL: "p3glrw7hevqdyjv",
  BOLIVIA_PD: "kn54qllh02qvy9d",
  URUGUAY_PD: "v2y8m4zhydql074",
  NWSL: "4zp5rzghvzq82w1",
  // 2026-06-12 추가 — 유럽 2부 5종 리그 순위 추가 작업 (league-id-mapping.json tsId 와 동일)
  EREDIVISIE_2: "kdj2ryohdkq1zpg",
  PRIMEIRA_LIGA_2: "gx7lm7phpnm2wdk",
  TURKEY_2: "9k82rekhgorepzj",
  BELGIUM_2: "gx7lm7ph5nm2wdk",
  // 클럽 친선 (프리시즌 등) — 전 세계 클럽 친선이 이 한 comp 에 모임. 워커(collect-friendlies)에서 TheSports 수집.
  CLUB_FRIENDLY: "gpxwrxlhgpryk0j",
  // 2026-08-11 — 7m 재대조 확장 (competition/additional/list 실측). WK_LEAGUE 는 af 660
  // 등록만 있고 매치가 전무했던 리그 — ts 승격으로 실수집 개시.
  LEAGUES_CUP: "56ypq3nhlp8md7o",
  WK_LEAGUE: "p4jwq2gh4o9m0ve",
  CANADA_CHAMP: "p4jwq2gh27m0veo",
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
- 북유럽 2부: NORWAY_1L, SUPERETTAN, YKKONEN, ICELAND_1L
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
