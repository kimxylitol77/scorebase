// 커리어 시뮬레이터용 리그 메타 — 국가·티어·표기명 (Team.eloRating 이 전부 1500 기본값이라 수동 지정)
export interface LeagueMeta {
  /** 표시용 리그명 */
  label: string;
  /** 국가 코드 (nations.ts 의 code 와 일치) */
  country: string;
  /**
   * 전력 티어. 1 = 세계 최상위, 6 = 유스가 시작하는 최하위.
   * 이적 제안은 선수 OVR 을 티어로 환산해 뽑는다.
   */
  tier: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * 게임에 등장하는 리그.
 * Team.league 는 과거 시즌 소속이 누적돼 있어(EPL 에 헐 시티 등) 현 소속 표기로는 부정확하다.
 * 게임에서는 "그 리그 수준의 구단" 정도로만 쓴다.
 */
export const LEAGUES: Record<string, LeagueMeta> = {
  // 1티어 — 유럽 최상위
  EPL: { label: "프리미어리그", country: "ENG", tier: 1 },
  LALIGA: { label: "라리가", country: "ESP", tier: 1 },
  BUNDESLIGA: { label: "분데스리가", country: "GER", tier: 1 },
  SERIE_A: { label: "세리에 A", country: "ITA", tier: 1 },
  LIGUE_1: { label: "리그 1", country: "FRA", tier: 1 },

  // 2티어 — 유럽 중상위·신흥 부국
  EREDIVISIE: { label: "에레디비시", country: "NED", tier: 2 },
  PRIMEIRA_LIGA: { label: "프리메이라리가", country: "POR", tier: 2 },
  SAUDI_PL: { label: "사우디 프로리그", country: "KSA", tier: 2 },
  RPL: { label: "러시아 프리미어리그", country: "RUS", tier: 2 },
  SPL: { label: "스코티시 프리미어십", country: "SCO", tier: 2 },
  JUPILER_PL: { label: "주필러 프로리그", country: "BEL", tier: 2 },
  SUPER_LIG: { label: "쉬페르리그", country: "TUR", tier: 2 },
  BRASILEIRAO: { label: "브라질 세리에 A", country: "BRA", tier: 2 },
  ARGENTINA_PL: { label: "아르헨티나 프리메라", country: "ARG", tier: 2 },

  // 3티어 — 2부 상위·아시아/북중미 최상위
  CHAMPIONSHIP: { label: "챔피언십", country: "ENG", tier: 3 },
  LALIGA_2: { label: "라리가 2", country: "ESP", tier: 3 },
  BUNDESLIGA_2: { label: "2. 분데스리가", country: "GER", tier: 3 },
  SERIE_B: { label: "세리에 B", country: "ITA", tier: 3 },
  LIGUE_2: { label: "리그 2", country: "FRA", tier: 3 },
  K_LEAGUE_1: { label: "K리그1", country: "KOR", tier: 3 },
  J1_LEAGUE: { label: "J1리그", country: "JPN", tier: 3 },
  MLS: { label: "MLS", country: "USA", tier: 3 },
  LIGA_MX: { label: "리가 MX", country: "MEX", tier: 3 },
  EKSTRAKLASA: { label: "에크스트라클라사", country: "POL", tier: 3 },
  UKRAINE_PL: { label: "우크라이나 프리미어리그", country: "UKR", tier: 3 },

  // 4티어 — 하위 리그·중견 국가
  LEAGUE_ONE: { label: "리그 원", country: "ENG", tier: 4 },
  K_LEAGUE_2: { label: "K리그2", country: "KOR", tier: 4 },
  J2_LEAGUE: { label: "J2리그", country: "JPN", tier: 4 },
  BRASILEIRAO_2: { label: "브라질 세리에 B", country: "BRA", tier: 4 },
  ARG_PRIMERA_NACIONAL: { label: "프리메라 나시오날", country: "ARG", tier: 4 },
  DENMARK_SL: { label: "덴마크 수페르리가", country: "DEN", tier: 4 },
  CZECH_2: { label: "체코 2부", country: "CZE", tier: 4 },
  TURKEY_2: { label: "튀르키예 1리그", country: "TUR", tier: 4 },
  CHINA_2: { label: "중국 갑급리그", country: "CHN", tier: 4 },
  BELGIUM_2: { label: "벨기에 챌린저 프로리그", country: "BEL", tier: 4 },
  ROMANIA_L2: { label: "루마니아 리가 2", country: "ROU", tier: 4 },
  THAI_L1: { label: "타이 리그 1", country: "THA", tier: 4 },
  INDIA_ISL: { label: "인도 슈퍼리그", country: "IND", tier: 4 },

  // 5~6티어 — 유스가 출발하는 저변
  LEAGUE_TWO: { label: "리그 투", country: "ENG", tier: 5 },
  SCOT_LEAGUE_ONE: { label: "스코티시 리그 원", country: "SCO", tier: 5 },
  CHINA_3: { label: "중국 을급리그", country: "CHN", tier: 5 },
  KAZAKHSTAN_PL: { label: "카자흐스탄 프리미어리그", country: "KAZ", tier: 5 },
  BELARUS_PL: { label: "벨라루스 프리미어리그", country: "BLR", tier: 5 },
  WALES_PL: { label: "웨일스 프리미어리그", country: "WAL", tier: 5 },
  NATIONAL_LEAGUE: { label: "내셔널리그", country: "ENG", tier: 6 },
  SCOT_LEAGUE_TWO: { label: "스코티시 리그 투", country: "SCO", tier: 6 },
  IRELAND_2: { label: "아일랜드 1부", country: "IRL", tier: 6 },
  LATVIA_VL: { label: "라트비아 비르슬리가", country: "LVA", tier: 6 },
  ESTONIA_ML: { label: "에스토니아 메이스트릴리가", country: "EST", tier: 6 },
  LITHUANIA_AL: { label: "리투아니아 A리가", country: "LTU", tier: 6 },
};

export type LeagueCode = keyof typeof LEAGUES;
