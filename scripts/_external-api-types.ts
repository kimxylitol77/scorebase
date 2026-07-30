// 일회성 데이터 빌드 스크립트가 쓰는 외부 API 응답 shape 모음.
//
// TheSports·Wikidata 등은 공식 타입 패키지를 주지 않는다. any 로 두면 필드명 오타를
// 컴파일러가 못 잡으므로, "우리가 실제로 읽는 필드만 옵셔널로" 적어 둔다.
// 여기 없는 필드가 필요하면 그때 추가하면 된다 — 전체 스키마를 옮겨 적을 필요는 없다.

/** TheSports 목록 API 공통 봉투. 실패 시 g() 헬퍼가 err 를 채운다. */
export interface TsListResponse<T> {
  results?: T[];
  code?: number;
  err?: string;
}

/** /v1/lol/tournament/table/list 한 행 */
export interface TsTableRow {
  tournament_id?: string;
  stage_id?: string;
  team_id?: string;
  part_stage_id?: string;
  position?: number | string;
  win?: number | string;
  lose?: number | string;
}

/** /v1/lol/team/list 한 행 */
export interface TsTeamRow {
  id?: string;
  name?: string;
  short_name?: string;
  abbr?: string;
  logo?: string;
}

/** /v1/lol/player/list 한 행 */
export interface TsPlayerRow {
  id?: string;
  birthday?: number | string | null;
  logo?: string;
  name?: string;
  real_name?: string;
  position?: string;
  team_id?: string;
  country_id?: string;
}

/** /v1/lol/hero/list · equipment/list 한 행 */
export interface TsNamedRow {
  id?: string | number;
  name?: string;
  logo?: string;
}

/** Wikidata SPARQL 결과 — 바인딩 값은 전부 {value: string} 형태다. */
export interface WdValue {
  value: string;
}
export interface WdSparqlResponse<K extends string = string> {
  results?: { bindings?: Array<Partial<Record<K, WdValue>>> };
}

/** MediaWiki action=query 응답 중 우리가 쓰는 부분. */
export interface WikiPage {
  pageid?: number;
  title?: string;
  description?: string;
  missing?: string;
  // formatversion=2 는 title, 구버전은 "*"
  langlinks?: Array<{ lang?: string; title?: string; "*"?: string }>;
  revisions?: Array<{ slots?: { main?: { "*"?: string } }; "*"?: string }>;
}
export interface WikiQueryResponse {
  query?: { pages?: Record<string, WikiPage> };
}

/**
 * 스키마가 넓고 얕게만 쓰는 행 (id·updated_at·중첩 stat 등).
 * 값이 unknown 이라 Number()/String() 로 좁혀 써야 한다 — any 처럼 조용히 통과하지 않는다.
 */
export type TsAnyRow = Record<string, unknown>;

// === Wikidata / MediaWiki ===

/** wbsearchentities 결과 항목 */
export interface WbSearchEntity {
  id?: string;
  label?: string;
  description?: string;
}

/** claim 의 값 — 종류마다 모양이 달라 실제로 쓰는 것만. */
export interface WbSnakValue {
  id?: string;
  time?: string;
  text?: string;
  amount?: string;
}
export interface WbSnak {
  // 값 모양은 datatype 마다 다르지만 이 스크립트들이 읽는 건 전부 객체형(entity·time)이다.
  datavalue?: { value?: WbSnakValue };
}
export interface WbClaim {
  mainsnak?: WbSnak;
  qualifiers?: Record<string, WbSnak[]>;
  rank?: string;
}
export interface WbEntity {
  id?: string;
  claims?: Record<string, WbClaim[]>;
  labels?: Record<string, { language?: string; value?: string }>;
  sitelinks?: Record<string, { site?: string; title?: string }>;
}

/** action=parse 결과 (섹션 목록 / 섹션 본문) */
export interface WikiParseResponse {
  parse?: {
    sections?: Array<{ line?: string; index?: string | number }>;
    text?: { "*"?: string };
    // formatversion=2 면 문자열, 아니면 { "*": string }
    wikitext?: string | { "*"?: string };
  };
}

/**
 * 위키 계열 API 공통 응답. 우리가 읽는 최상위 키만 타입을 주고,
 * 나머지는 unknown 으로 남겨 무심코 쓰지 못하게 한다.
 */
export interface WikiApiResponse extends WikiParseResponse {
  search?: WbSearchEntity[];
  entities?: Record<string, WbEntity>;
  query?: { pages?: Record<string, WikiPage> };
  [key: string]: unknown;
}

/** action=query&list=search 결과 (팀명 검증 스크립트용) */
export interface WikiSearchResponse {
  query?: {
    search?: Array<{ title?: string; snippet?: string }>;
    // formatversion=2 는 배열, 구버전은 pageid 키 객체
    pages?: WikiPage[];
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
  };
}

/** TheSports 시즌 선수 스탯 한 행 — data/player-season-stats.json 생성용 */
export interface TsSeasonPlayerRow {
  player?: { id?: string; name?: string; position?: string; logo?: string };
  team?: { id?: string; name?: string };
  matches?: number | null;
  first?: number | null;
  goals?: number | null;
  assists?: number | null;
  minutes_played?: number | null;
  shots?: number | null;
  shots_on_target?: number | null;
  passes?: number | null;
  passes_accuracy?: number | null;
  key_passes?: number | null;
  tackles?: number | null;
  interceptions?: number | null;
  clearances?: number | null;
  dribble_succ?: number | null;
  dribble_attempts?: number | null;
  duels_won?: number | null;
  duels?: number | null;
  fouls?: number | null;
  was_fouled?: number | null;
  yellow_cards?: number | null;
  red_cards?: number | null;
  saves?: number | null;
  conceded?: number | null;
  rating?: number | string | null;
}
