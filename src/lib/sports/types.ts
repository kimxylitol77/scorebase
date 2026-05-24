// 스포츠 데이터 공통 타입 — 모든 데이터 소스(api-football, MySportsFeeds 등)
// 의 응답을 이 형태로 정규화해서 처리한다.

export type League =
  | "KBO"
  | "NPB" // 일본 프로야구 (api-sports baseball league id=2)
  | "EPL"
  | "NBA"
  | "NHL"
  | "MLB"
  | "LALIGA"
  | "BUNDESLIGA"
  | "SERIE_A"
  | "LIGUE_1"
  | "MLS"
  | "UCL"
  | "WORLD_CUP" // 2026 FIFA 북중미 월드컵
  | "LOL" // LCK (League of Legends Champions Korea) — e스포츠
  // 아시아 축구
  | "K_LEAGUE_1" // K리그 1 (한국 1부) — api-football
  | "K_LEAGUE_2" // K리그 2 (한국 2부) — api-football
  | "J1_LEAGUE" // J1 리그 (일본 1부) — ESPN
  | "J2_LEAGUE" // J2 리그 (일본 2부) — api-football
  | "AFC_CL" // AFC 챔피언스리그 엘리트 — ESPN
  | "SAUDI_PL" // 사우디 프로 리그 — api-football
  // 유럽 컵
  | "UEL" // UEFA 유로파 리그 — api-football
  | "UECL" // UEFA 유로파 컨퍼런스 — api-football
  // 유럽 메이저 2부
  | "CHAMPIONSHIP" // 잉글랜드 챔피언십 — api-football
  | "LALIGA_2" // 스페인 라리가 2 — api-football
  | "BUNDESLIGA_2" // 독일 분데스리가 2 — api-football
  | "SERIE_B" // 이탈리아 세리에 B — api-football
  | "LIGUE_2" // 프랑스 리그 2 — api-football
  // 세계 클럽 대회
  | "CLUB_WORLD_CUP" // FIFA 클럽 월드컵 — api-football
  // 신규 — 아시아 추가
  | "AFC_CL_TWO" // AFC 챔피언스리그 2 — api-football
  | "AFC_U23" // AFC U23 아시안컵 — api-football
  | "CSL" // 중국 슈퍼리그 — api-football
  | "A_LEAGUE" // 호주 A-리그 — api-football
  // 유럽 추가
  | "EREDIVISIE" // 네덜란드 에레디비시
  | "PRIMEIRA_LIGA" // 포르투갈 프리메이라
  | "SUPER_LIG" // 터키 쉬페르 리그
  | "JUPILER_PL" // 벨기에 주피러 프로 리그
  | "SPL" // 스코틀랜드 프리미어십
  | "GREEK_SL" // 그리스 슈퍼 리그 1
  // 북중남미 추가
  | "BRASILEIRAO" // 브라질 세리에 A
  | "LIGA_MX" // 멕시코 리가 MX
  | "COPA_LIB" // CONMEBOL 코파 리베르타도레스
  | "COPA_SUD" // CONMEBOL 코파 수다메리카나
  // 유럽 + 동유럽 (8월~5월 시즌)
  | "EKSTRAKLASA" // 폴란드 에크스트라클라사 (1부)
  | "POLAND_1L" // 폴란드 I Liga (2부)
  | "BULGARIA_PL" // 불가리아 First League (1부)
  | "LIGA_I" // 루마니아 Liga I (1부)
  | "SWISS_SL" // 스위스 슈퍼 리그 (1부)
  | "CHALLENGE_LEAGUE" // 스위스 챌린지 리그 (2부)
  | "ARMENIA_PL" // 아르메니아 Premier League (1부)
  // 유럽 Tier 1·2 추가 (8월~5월)
  | "AUSTRIA_BL" // 오스트리아 분데스리가 (1부)
  | "CZECH_L" // 체코 Czech Liga (1부)
  | "HNL" // 크로아티아 HNL (1부)
  | "UKRAINE_PL" // 우크라이나 Premier League (1부)
  | "HUNGARY_NB1" // 헝가리 NB I (1부)
  | "SERBIA_SL" // 세르비아 Super Liga (1부)
  | "SLOVAKIA_SL" // 슬로바키아 Super Liga (1부)
  | "SLOVENIA_SNL" // 슬로베니아 1. SNL (1부)
  | "CYPRUS_1D" // 키프로스 1. Division (1부)
  | "DENMARK_SL" // 덴마크 Superliga (1부)
  // 유럽 Tier 3 추가
  | "IRELAND_PD" // 아일랜드 Premier Division (1부, 2~11월 봄~가을)
  | "BOSNIA_PL" // 보스니아 Premijer Liga (1부, 8~5월)
  | "ALBANIA_SL" // 알바니아 Superliga (1부, 8~5월)
  | "MOLDOVA_SL" // 몰도바 Super Liga (1부, 8~5월)
  // 북유럽 (봄~가을 시즌, 3~11월 또는 5~9월)
  | "ELITESERIEN" // 노르웨이 Eliteserien (1부)
  | "NORWAY_1L" // 노르웨이 1. Division (2부)
  | "ALLSVENSKAN" // 스웨덴 Allsvenskan (1부)
  | "SUPERETTAN" // 스웨덴 Superettan (2부)
  | "VEIKKAUSLIIGA" // 핀란드 Veikkausliiga (1부)
  | "YKKONEN" // 핀란드 Ykkönen (2부)
  | "URVALSDEILD" // 아이슬란드 Úrvalsdeild (1부)
  | "ICELAND_1L" // 아이슬란드 1. Deild (2부)
  // 남미 추가 (달력 연도 시즌)
  | "CHILE_PD" // 칠레 Primera División (1부)
  | "CHILE_PB" // 칠레 Primera B (2부)
  | "ECUADOR_LP" // 에콰도르 Liga Pro (1부)
  | "COLOMBIA_PA" // 콜롬비아 Primera A (1부)
  | "PERU_PD" // 페루 Primera División (1부)
  | "VENEZUELA_PD" // 베네수엘라 Primera División (1부)
  // 기타 (아시아·중동·아프리카·북미 보강)
  | "EGYPT_PL" // 이집트 Premier League (8~5월)
  | "ISRAEL_PL" // 이스라엘 Ligat Ha'al (8~5월)
  | "INDIA_ISL" // 인도 ISL (9~5월)
  | "VIETNAM_VL1" // 베트남 V.League 1 (8~6월, 달력 표기)
  | "INDONESIA_L1" // 인도네시아 Liga 1 (8~5월)
  | "SINGAPORE_PL" // 싱가포르 Premier League (달력)
  | "UAE_PL" // UAE Pro League (8~5월)
  | "QATAR_SL" // 카타르 Stars League (8~5월)
  | "MOROCCO_BP" // 모로코 Botola Pro (9~5월)
  | "SOUTHAFRICA_PSL" // 남아공 PSL (8~5월)
  | "USA_USL_CH" // USL Championship (3~10월)
  | "CANADA_PL" // Canadian Premier League (4~10월)
  // 컵 대회 (2026-05-20 추가)
  | "FA_CUP" // 잉글랜드 FA Cup — api-football
  | "EFL_CUP" // 잉글랜드 EFL Cup / 카라바오 컵 — api-football
  | "COPA_DEL_REY" // 스페인 코파 델 레이 — api-football
  | "COPPA_ITALIA" // 이탈리아 코파 이탈리아 — api-football
  | "DFB_POKAL" // 독일 DFB-Pokal — api-football
  | "COUPE_DE_FRANCE" // 프랑스 쿠프 드 프랑스 — api-football
  | "KFA_CUP" // 한국 FA컵 — api-football
  | "EMPEROR_CUP" // 일본 천황배 — api-football
  | "CONCACAF_CCUP" // CONCACAF Champions Cup — api-football
  | "AFC_CUP" // AFC Cup (3부 클럽 대회) — api-football
  // 농구 — 여자 (2026-05-21 추가)
  | "WNBA" // WNBA (미국 여자 농구) — api-sports basketball v1, league=13. 시즌 4~9월
  // ── 축구 23개 추가 (2026-05-22 — 네임드/7m 격차 해소) ──
  // 한국 + 일본 하부
  | "K3_LEAGUE" // K3 리그
  | "K4_LEAGUE" // K4 리그
  | "J3_LEAGUE" // J3 리그
  // 동남아
  | "THAI_L1" // 태국 1부
  | "VIETNAM_VL2" // 베트남 V.League 2
  // 남미
  | "ARGENTINA_PL" // 아르헨티나 Liga Profesional
  | "URUGUAY_PD" // 우루과이 Primera División
  | "PARAGUAY_PD" // 파라과이 Primera División
  | "BOLIVIA_PD" // 볼리비아 División Profesional
  // 국가대표 토너 / 예선 / 친선
  | "AFCON" // Africa Cup of Nations
  | "UEFA_NL" // UEFA Nations League
  | "WC_QUAL" // 월드컵 예선 (지역 묶음)
  | "EURO_QUAL" // 유로 예선
  | "CONCACAF_GOLD" // CONCACAF 골드컵
  | "INTL_FRIENDLY" // 국가대표 친선 (A매치)
  | "U20_WC" // U-20 월드컵
  | "U17_WC" // U-17 월드컵
  | "OLYMPICS_FOOTBALL" // 올림픽 축구
  // 여자 축구
  | "WSL" // 잉글랜드 여자 슈퍼리그
  | "NWSL" // 미국 NWSL
  | "WK_LEAGUE" // 한국 WK리그
  | "UEFA_WCL" // UEFA 여자 챔피언스리그
  | "A_LEAGUE_W" // 호주 A-리그 여자
  // ── 신규 (2026-05-24) ──
  | "SUI_CUP" // 스위스컵 (8~5월)
  | "LEAGUE_ONE" // 잉글랜드 League One (3부, 8~5월)
  | "LATVIA_VL" // 라트비아 비르슬리가 (1부, 봄~가을)
  | "BELARUS_PL" // 벨라루스 프리미어 리그 (1부, 봄~가을)
  // ── 신규 (2026-05-24, 2차) ──
  | "ESTONIA_ML" // 에스토니아 Meistriliiga (1부, 봄~가을)
  | "LITHUANIA_AL" // 리투아니아 A Lyga (1부, 봄~가을)
  | "LEVAIN_CUP" // 일본 J리그컵 / 르베인 컵 (달력, 3~10월)
  | "KAZAKHSTAN_PL" // 카자흐스탄 프리미어리그 (1부, 봄~가을)
  | "GEORGIA_EL" // 조지아 Erovnuli Liga (1부, 봄~가을)
  | "AZERBAIJAN_PL" // 아제르바이잔 프리미어리그 (1부, 8~5월)
  | "EREDIVISIE_2" // 네덜란드 Eerste Divisie (2부, 8~5월)
  | "PRIMEIRA_LIGA_2"; // 포르투갈 Liga Portugal 2 (2부, 8~5월)

/** 축구 리그(다중 리그 컬렉터에서 분기용) */
export const SOCCER_LEAGUES = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
  "K_LEAGUE_1",
  "K_LEAGUE_2",
  "J1_LEAGUE",
  "J2_LEAGUE",
  "AFC_CL",
  "SAUDI_PL",
  "UEL",
  "UECL",
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "CLUB_WORLD_CUP",
  "AFC_CL_TWO",
  "AFC_U23",
  "CSL",
  "A_LEAGUE",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "GREEK_SL",
  "BRASILEIRAO",
  "LIGA_MX",
  "COPA_LIB",
  "COPA_SUD",
  "EKSTRAKLASA",
  "POLAND_1L",
  "BULGARIA_PL",
  "LIGA_I",
  "SWISS_SL",
  "CHALLENGE_LEAGUE",
  "ARMENIA_PL",
  "AUSTRIA_BL",
  "CZECH_L",
  "HNL",
  "UKRAINE_PL",
  "HUNGARY_NB1",
  "SERBIA_SL",
  "SLOVAKIA_SL",
  "SLOVENIA_SNL",
  "CYPRUS_1D",
  "DENMARK_SL",
  "IRELAND_PD",
  "BOSNIA_PL",
  "ALBANIA_SL",
  "MOLDOVA_SL",
  "ELITESERIEN",
  "NORWAY_1L",
  "ALLSVENSKAN",
  "SUPERETTAN",
  "VEIKKAUSLIIGA",
  "YKKONEN",
  "URVALSDEILD",
  "ICELAND_1L",
  "CHILE_PD",
  "CHILE_PB",
  "ECUADOR_LP",
  "COLOMBIA_PA",
  "PERU_PD",
  "VENEZUELA_PD",
  "EGYPT_PL",
  "ISRAEL_PL",
  "INDIA_ISL",
  "VIETNAM_VL1",
  "INDONESIA_L1",
  "SINGAPORE_PL",
  "UAE_PL",
  "QATAR_SL",
  "MOROCCO_BP",
  "SOUTHAFRICA_PSL",
  "USA_USL_CH",
  "CANADA_PL",
  "FA_CUP",
  "EFL_CUP",
  "COPA_DEL_REY",
  "COPPA_ITALIA",
  "DFB_POKAL",
  "COUPE_DE_FRANCE",
  "KFA_CUP",
  "EMPEROR_CUP",
  "CONCACAF_CCUP",
  "AFC_CUP",
  // 신규 23개 (2026-05-22)
  "K3_LEAGUE",
  "K4_LEAGUE",
  "J3_LEAGUE",
  "THAI_L1",
  "VIETNAM_VL2",
  "ARGENTINA_PL",
  "URUGUAY_PD",
  "PARAGUAY_PD",
  "BOLIVIA_PD",
  "AFCON",
  "UEFA_NL",
  "WC_QUAL",
  "EURO_QUAL",
  "CONCACAF_GOLD",
  "INTL_FRIENDLY",
  "U20_WC",
  "U17_WC",
  "OLYMPICS_FOOTBALL",
  "WSL",
  "NWSL",
  "WK_LEAGUE",
  "UEFA_WCL",
  "A_LEAGUE_W",
  // 2026-05-24 추가
  "SUI_CUP",
  "LEAGUE_ONE",
  "LATVIA_VL",
  "BELARUS_PL",
  // 2026-05-24 추가 (2차)
  "ESTONIA_ML",
  "LITHUANIA_AL",
  "LEVAIN_CUP",
  "KAZAKHSTAN_PL",
  "GEORGIA_EL",
  "AZERBAIJAN_PL",
  "EREDIVISIE_2",
  "PRIMEIRA_LIGA_2",
] as const satisfies readonly League[];

/** PREVIEW/RECAP 자동 생성 제외 리그 — 수집만 (스코어/일정) */
export const NO_ARTICLE_LEAGUES: readonly League[] = [
  "K_LEAGUE_2",
  "J2_LEAGUE",
  "SAUDI_PL",
  // 2026-05-21 사용자 결정 — UEL/UECL PREVIEW/RECAP 자동 생성 활성화
  // (이전: NO_ARTICLE_LEAGUES 에 포함 → 제거)
  "CHAMPIONSHIP",
  "LALIGA_2",
  "BUNDESLIGA_2",
  "SERIE_B",
  "LIGUE_2",
  "CLUB_WORLD_CUP",
  "AFC_CL_TWO",
  "AFC_U23",
  "CSL",
  "A_LEAGUE",
  "EREDIVISIE",
  "PRIMEIRA_LIGA",
  "SUPER_LIG",
  "JUPILER_PL",
  "SPL",
  "GREEK_SL",
  "BRASILEIRAO",
  "LIGA_MX",
  "COPA_LIB",
  "COPA_SUD",
  "EKSTRAKLASA",
  "POLAND_1L",
  "BULGARIA_PL",
  "LIGA_I",
  "SWISS_SL",
  "CHALLENGE_LEAGUE",
  "ARMENIA_PL",
  "AUSTRIA_BL",
  "CZECH_L",
  "HNL",
  "UKRAINE_PL",
  "HUNGARY_NB1",
  "SERBIA_SL",
  "SLOVAKIA_SL",
  "SLOVENIA_SNL",
  "CYPRUS_1D",
  "DENMARK_SL",
  "IRELAND_PD",
  "BOSNIA_PL",
  "ALBANIA_SL",
  "MOLDOVA_SL",
  "ELITESERIEN",
  "NORWAY_1L",
  "ALLSVENSKAN",
  "SUPERETTAN",
  "VEIKKAUSLIIGA",
  "YKKONEN",
  "URVALSDEILD",
  "ICELAND_1L",
  "CHILE_PD",
  "CHILE_PB",
  "ECUADOR_LP",
  "COLOMBIA_PA",
  "PERU_PD",
  "VENEZUELA_PD",
  "EGYPT_PL",
  "ISRAEL_PL",
  "INDIA_ISL",
  "VIETNAM_VL1",
  "INDONESIA_L1",
  "SINGAPORE_PL",
  "UAE_PL",
  "QATAR_SL",
  "MOROCCO_BP",
  "SOUTHAFRICA_PSL",
  "USA_USL_CH",
  "CANADA_PL",
  // 컵 대회 10개 — 모두 매치 수집만, 글 자동 생성 X (2026-05-20 사용자 결정)
  "FA_CUP",
  "EFL_CUP",
  "COPA_DEL_REY",
  "COPPA_ITALIA",
  "DFB_POKAL",
  "COUPE_DE_FRANCE",
  "KFA_CUP",
  "EMPEROR_CUP",
  "CONCACAF_CCUP",
  "AFC_CUP",
  // 2026-05-24 추가 — 매치 수집만
  "SUI_CUP",
  "LEAGUE_ONE",
  "LATVIA_VL",
  "BELARUS_PL",
  // 2026-05-24 추가 (2차) — 매치 수집만
  "ESTONIA_ML",
  "LITHUANIA_AL",
  "LEVAIN_CUP",
  "KAZAKHSTAN_PL",
  "GEORGIA_EL",
  "AZERBAIJAN_PL",
  "EREDIVISIE_2",
  "PRIMEIRA_LIGA_2",
];

export type MatchStatus =
  | "SCHEDULED" // 예정
  | "LIVE" // 진행 중
  | "FINISHED" // 종료
  | "POSTPONED"; // 연기

export interface NormalizedTeam {
  externalId: string;
  name: string;
  shortName?: string;
  logoUrl?: string;
}

export interface NormalizedMatch {
  league: League;
  externalId: string;
  homeTeam: NormalizedTeam;
  awayTeam: NormalizedTeam;
  homeScore?: number;
  awayScore?: number;
  status: MatchStatus;
  startTime: Date;
  raw: unknown; // 원본 응답 (디버깅/추가 정보 추출용)
}

export interface MatchCollector {
  readonly league: League;
  /** 특정 날짜의 경기 목록 가져오기 (YYYY-MM-DD) */
  fetchByDate(date: string): Promise<NormalizedMatch[]>;
}
