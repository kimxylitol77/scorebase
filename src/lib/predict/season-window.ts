// 리그별 "현재 시즌" 시작 하한 계산 — 시즌 시뮬·순위가 지난 시즌까지 누적되는 버그 방지.
// (predictions/[league] 가 무제한 findMany 로 두 시즌을 합산 → KBO 승점 231·MLB 다저스
//  우승 99.9% 같은 불가능 수치. 2026-07-02 감사 A2)

/**
 * 시즌 경계(월/일) — 이 날짜의 "가장 최근 발생일"이 현재 시즌 시작 하한.
 * 경계는 각 리그 오프시즌 한복판으로 잡아 시즌 중 데이터가 잘리지 않게 한다.
 * 여기 없는 리그(WORLD_CUP 등 단일 대회)는 null — 필터 없음.
 */
export const SEASON_BOUNDARY: Record<string, { month: number; day: number }> = {
  // 봄 개막 · 연내 종료
  KBO: { month: 2, day: 1 },
  NPB: { month: 2, day: 1 },
  // MLB 는 2~3월 시범경기가 DB 에 수집돼 있어(2026-03 완료 390건, 시범 3/24 종료·정규
  // 개막 3/26 실측) 경계를 3/25 로. 국제 개막 시리즈(3/18~) 있는 해엔 그 1~2경기가
  // 잘리는 허용 오차 — 근본 해결은 수집 단계 preseason 태깅(후속).
  MLB: { month: 3, day: 25 },
  MLS: { month: 2, day: 1 },
  K_LEAGUE_1: { month: 2, day: 1 },
  K_LEAGUE_2: { month: 2, day: 1 },
  // J리그는 2026-27 부터 추춘제(8월 개막·5월 종료) 전환 — 전환기 시즌은 2~6월에 끝났고
  // 새 시즌 8월 개막 (DB 실측: 2026-06 이후 공백 → 2026-08 재개). 경계 2/1 이면
  // 끝난 전환기 시즌이 "현재 시즌"에 섞여 predictions 순위·시뮬이 오염된다.
  J1_LEAGUE: { month: 7, day: 1 },
  J2_LEAGUE: { month: 7, day: 1 },
  WNBA: { month: 2, day: 1 },
  CPBL: { month: 2, day: 1 },
  LMB: { month: 2, day: 1 },
  // 여름 개막 유럽 축구 (8월 개막 · 이듬해 5월 종료)
  EPL: { month: 7, day: 1 },
  LALIGA: { month: 7, day: 1 },
  BUNDESLIGA: { month: 7, day: 1 },
  SERIE_A: { month: 7, day: 1 },
  LIGUE_1: { month: 7, day: 1 },
  UCL: { month: 7, day: 1 },
  UEL: { month: 7, day: 1 },
  UECL: { month: 7, day: 1 },
  AFC_CL: { month: 7, day: 1 },
  // 가을 개막 겨울 리그 (10월 개막 · 이듬해 6월 종료)
  NBA: { month: 8, day: 1 },
  NHL: { month: 8, day: 1 },
  // 남반구 겨울 리그 — 달력연도 안에서 끝난다 (AIHL 4~9월 · NZIHL 5~8월)
  AIHL: { month: 3, day: 1 },
  NZIHL: { month: 4, day: 1 },
  // LCK (1월 개막 · 9월 종료)
  LOL: { month: 12, day: 1 },
  // ───── 2026-08-08 축구 전 리그 일괄 등록 — 시즌 롤오버 근본 대응 ─────
  // 최근 26개월 경기 월분포에서 오프시즌 공백 한복판을 자동 산출 (scripts 로 도출 후 고정).
  // 수집 이력이 짧아 산출을 신뢰할 수 없는 리그는 실제 일정 기준 수동값:
  //   유럽형(8~5월)=6/15 · 달력연도(봄~가을)=1/1 · K 하부=2/1.
  AFC_CL_TWO: { month: 6, day: 1 },
  ALBANIA_SL: { month: 7, day: 1 },
  ALGERIA_L1: { month: 6, day: 15 },
  ALLSVENSKAN: { month: 2, day: 1 },
  ARGENTINA_PL: { month: 6, day: 1 },
  ARG_PRIMERA_NACIONAL: { month: 1, day: 1 },
  ARMENIA_PL: { month: 2, day: 1 },
  AUSTRIA_2: { month: 6, day: 15 },
  AUSTRIA_BL: { month: 7, day: 1 },
  AZERBAIJAN_PL: { month: 7, day: 1 },
  A_LEAGUE: { month: 8, day: 1 },
  A_LEAGUE_W: { month: 8, day: 1 },
  BELARUS_PL: { month: 1, day: 1 },
  BELGIUM_2: { month: 6, day: 15 },
  BOLIVIA_PD: { month: 1, day: 1 },
  BOSNIA_PL: { month: 1, day: 1 },
  BRASILEIRAO: { month: 6, day: 1 },
  BULGARIA_PL: { month: 1, day: 1 },
  BUNDESLIGA_2: { month: 7, day: 1 },
  CANADA_PL: { month: 1, day: 1 },
  CHALLENGE_LEAGUE: { month: 6, day: 1 },
  CHAMPIONSHIP: { month: 7, day: 1 },
  CHILE_PB: { month: 1, day: 1 },
  CHILE_PD: { month: 1, day: 1 },
  CHINA_2: { month: 1, day: 1 },
  CHINA_3: { month: 1, day: 1 },
  COLOMBIA_PA: { month: 11, day: 1 },
  COPA_LIB: { month: 11, day: 1 },
  COPA_SUD: { month: 12, day: 1 },
  COSTA_RICA_PD: { month: 6, day: 15 },
  CSL: { month: 1, day: 1 },
  CYPRUS_1D: { month: 7, day: 1 },
  CZECH_2: { month: 6, day: 15 },
  CZECH_L: { month: 1, day: 1 },
  DENMARK_2: { month: 6, day: 15 },
  DENMARK_SL: { month: 1, day: 1 },
  ECUADOR_LP: { month: 12, day: 1 },
  EGYPT_PL: { month: 7, day: 1 },
  EKSTRAKLASA: { month: 1, day: 1 },
  ELITESERIEN: { month: 2, day: 1 },
  ELSALVADOR_PD: { month: 6, day: 15 },
  EREDIVISIE: { month: 7, day: 1 },
  EREDIVISIE_2: { month: 7, day: 1 },
  ESTONIA_ML: { month: 1, day: 1 },
  ETTAN_NORRA: { month: 1, day: 1 },
  ETTAN_SODRA: { month: 1, day: 1 },
  FAROE_PL: { month: 1, day: 1 },
  GEORGIA_EL: { month: 2, day: 1 },
  GHANA_PL: { month: 7, day: 1 },
  GREEK_SL: { month: 7, day: 1 },
  GUATEMALA_LN: { month: 6, day: 15 },
  HNL: { month: 7, day: 1 },
  HONDURAS_LN: { month: 6, day: 15 },
  HUNGARY_2: { month: 6, day: 15 },
  HUNGARY_NB1: { month: 6, day: 1 },
  ICELAND_1L: { month: 1, day: 1 },
  INDIA_ISL: { month: 7, day: 1 },
  INDONESIA_L1: { month: 7, day: 1 },
  IRAQ_SL: { month: 6, day: 15 },
  IRELAND_2: { month: 1, day: 1 },
  IRELAND_PD: { month: 12, day: 1 },
  ISRAEL_PL: { month: 7, day: 1 },
  JUPILER_PL: { month: 7, day: 1 },
  K3_LEAGUE: { month: 2, day: 1 },
  K4_LEAGUE: { month: 2, day: 1 },
  KAKKONEN_A: { month: 1, day: 1 },
  KAKKONEN_B: { month: 1, day: 1 },
  KAKKONEN_C: { month: 1, day: 1 },
  KAZAKHSTAN_PL: { month: 1, day: 1 },
  LALIGA_2: { month: 7, day: 1 },
  LATVIA_VL: { month: 1, day: 1 },
  LEAGUE_ONE: { month: 7, day: 1 },
  LEAGUE_TWO: { month: 6, day: 15 },
  LIGA_I: { month: 6, day: 15 },
  LIGA_MX: { month: 6, day: 1 },
  LIGUE_2: { month: 7, day: 1 },
  LITHUANIA_AL: { month: 11, day: 1 },
  LUXEMBOURG_ND: { month: 6, day: 15 },
  MEXICO_2: { month: 6, day: 15 },
  MOLDOVA_SL: { month: 1, day: 1 },
  MONTENEGRO_1L: { month: 6, day: 15 },
  MOROCCO_BP: { month: 8, day: 1 },
  NATIONAL_LEAGUE: { month: 6, day: 15 },
  NICARAGUA_PD: { month: 6, day: 15 },
  NORWAY_1L: { month: 2, day: 1 },
  NORWAY_2D_G1: { month: 1, day: 1 },
  NORWAY_2D_G2: { month: 1, day: 1 },
  NWSL: { month: 1, day: 1 },
  PANAMA_LPF: { month: 6, day: 15 },
  PARAGUAY_PD: { month: 1, day: 1 },
  PERU_PD: { month: 11, day: 1 },
  POLAND_1L: { month: 1, day: 1 },
  PRIMEIRA_LIGA: { month: 7, day: 1 },
  PRIMEIRA_LIGA_2: { month: 7, day: 1 },
  QATAR_SL: { month: 6, day: 1 },
  ROMANIA_L2: { month: 6, day: 15 },
  RPL: { month: 6, day: 15 },
  RUSSIA_FNL: { month: 6, day: 15 },
  SAUDI_PL: { month: 7, day: 1 },
  SCOT_CHAMPIONSHIP: { month: 6, day: 15 },
  SCOT_LEAGUE_ONE: { month: 6, day: 15 },
  SCOT_LEAGUE_TWO: { month: 6, day: 15 },
  SERBIA_SL: { month: 1, day: 1 },
  SERIE_B: { month: 7, day: 1 },
  SINGAPORE_PL: { month: 7, day: 1 },
  SLOVAKIA_SL: { month: 1, day: 1 },
  SLOVENIA_SNL: { month: 1, day: 1 },
  SOUTHAFRICA_PSL: { month: 7, day: 1 },
  SPL: { month: 7, day: 1 },
  SUPERETTAN: { month: 2, day: 1 },
  SUPER_LIG: { month: 7, day: 1 },
  SWISS_SL: { month: 6, day: 1 },
  THAI_L1: { month: 7, day: 1 },
  TURKEY_2: { month: 6, day: 15 },
  UAE_PL: { month: 7, day: 1 },
  UEFA_WCL: { month: 6, day: 1 },
  UKRAINE_PL: { month: 7, day: 1 },
  URUGUAY_PD: { month: 11, day: 1 },
  URVALSDEILD: { month: 1, day: 1 },
  USA_USL_CH: { month: 1, day: 1 },
  UZBEKISTAN_SL: { month: 1, day: 1 },
  VEIKKAUSLIIGA: { month: 1, day: 1 },
  VENEZUELA_PD: { month: 11, day: 1 },
  VIETNAM_VL1: { month: 7, day: 15 },
  VIETNAM_VL2: { month: 6, day: 15 },
  WALES_PL: { month: 6, day: 15 },
  WK_LEAGUE: { month: 1, day: 1 },
  WSL: { month: 7, day: 1 },
  YKKONEN: { month: 1, day: 1 },
};

/** 현재 시즌 시작 하한 — 경계일의 가장 최근 발생일. 경계 미정의 리그는 null. */
export function currentSeasonStart(league: string, now: Date = new Date()): Date | null {
  const b = SEASON_BOUNDARY[league];
  if (!b) return null;
  const y = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(y, b.month - 1, b.day));
  return candidate.getTime() <= now.getTime()
    ? candidate
    : new Date(Date.UTC(y - 1, b.month - 1, b.day));
}

/** 직전 시즌 시작일 (start 기준 1년 전) — 오프시즌 폴백용. */
export function previousSeasonStart(start: Date): Date {
  return new Date(
    Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), start.getUTCDate()),
  );
}

/**
 * 시즌 경계를 두지 않는 대회 — 컵·국가대표·단일 대회·친선.
 * 축구 리그는 SEASON_BOUNDARY 아니면 여기, 둘 중 하나에 반드시 있어야 한다
 * (season-window.test.ts 가 강제). 새 리그 등록 시 여기서 컴파일/테스트가 잡아준다.
 */
export const NO_SEASON_BOUNDARY: ReadonlySet<string> = new Set([
  "AFCON",
  "AFC_CUP",
  "AFC_U23",
  "ASEAN_CHAMP",
  "CANADA_CHAMP", // 캐나다 국내 녹아웃 컵 — 연 1회 단판 토너먼트
  "CLUB_FRIENDLY",
  "CLUB_WORLD_CUP",
  "CONCACAF_CCUP",
  "CONCACAF_GOLD",
  "COPA_DEL_REY",
  "COPA_DO_BRASIL",
  "COPPA_ITALIA",
  "COUPE_DE_FRANCE",
  "DFB_POKAL",
  "EFL_CUP",
  "EMPEROR_CUP",
  "EURO_QUAL",
  "FA_CUP",
  "INTL_FRIENDLY",
  "KFA_CUP",
  "LEAGUES_CUP", // MLS × 리가 MX 여름 초청 대회 — 8월 한 달 단일 대회
  "LEVAIN_CUP",
  "OLYMPICS_FOOTBALL",
  "PORTUGAL_SUPER_CUP",
  "COMMUNITY_SHIELD",
  "SUPERCOPA_ESPANA",
  "DFL_SUPERCUP",
  "SUPERCOPPA_ITALIANA",
  "TROPHEE_DES_CHAMPIONS",
  "SCO_LEAGUE_CUP",
  "SUI_CUP",
  "SVENSKA_CUPEN",
  "U17_WC",
  "U20_WC",
  "UEFA_NL",
  "UEFA_U17",
  "UEFA_U19",
  "UEFA_U21",
  "UEFA_U21_Q",
  "WC_QUAL",
  "WORLD_CUP",
]);
