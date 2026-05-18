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
  | "DENMARK_SL"; // 덴마크 Superliga (1부)

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
] as const satisfies readonly League[];

/** PREVIEW/RECAP 자동 생성 제외 리그 — 수집만 (스코어/일정) */
export const NO_ARTICLE_LEAGUES: readonly League[] = [
  "K_LEAGUE_2",
  "J2_LEAGUE",
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
