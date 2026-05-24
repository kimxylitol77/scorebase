// 종목별 외부 권위 출처 매핑.
// 글 끝 "참고 출처" 박스에 자동 노출.
// rel="nofollow noopener" 로 PageRank 손실 방지 + 보안.

export interface ExternalLink {
  label: string;
  url: string;
  /** 호스트만 짧게 표시 (예: "mlb.com") */
  display: string;
}

export const EXTERNAL_SOURCES_BY_LEAGUE: Record<string, ExternalLink[]> = {
  // 야구
  MLB: [
    { label: "MLB 공식", url: "https://www.mlb.com", display: "mlb.com" },
    {
      label: "시즌 통계",
      url: "https://www.baseball-reference.com",
      display: "baseball-reference.com",
    },
  ],
  KBO: [
    {
      label: "KBO 공식",
      url: "https://www.koreabaseball.com",
      display: "koreabaseball.com",
    },
    {
      label: "시즌 통계",
      url: "https://www.statiz.co.kr",
      display: "statiz.co.kr",
    },
  ],
  NPB: [
    {
      label: "NPB 공식",
      url: "https://npb.jp",
      display: "npb.jp",
    },
    {
      label: "시즌 통계 (영문)",
      url: "https://www.baseball-reference.com/register/league.cgi?code=JPN-1",
      display: "baseball-reference.com",
    },
  ],

  // 농구·하키
  NBA: [
    { label: "NBA 공식", url: "https://www.nba.com", display: "nba.com" },
    {
      label: "시즌 통계",
      url: "https://www.basketball-reference.com",
      display: "basketball-reference.com",
    },
  ],
  NHL: [
    { label: "NHL 공식", url: "https://www.nhl.com", display: "nhl.com" },
    {
      label: "시즌 통계",
      url: "https://www.hockey-reference.com",
      display: "hockey-reference.com",
    },
  ],

  // 축구
  EPL: [
    {
      label: "프리미어리그 공식",
      url: "https://www.premierleague.com",
      display: "premierleague.com",
    },
  ],
  LALIGA: [
    { label: "라리가 공식", url: "https://www.laliga.com", display: "laliga.com" },
  ],
  BUNDESLIGA: [
    {
      label: "분데스리가 공식",
      url: "https://www.bundesliga.com",
      display: "bundesliga.com",
    },
  ],
  SERIE_A: [
    {
      label: "세리에 A 공식",
      url: "https://www.legaseriea.it",
      display: "legaseriea.it",
    },
  ],
  LIGUE_1: [
    {
      label: "리그앙 공식",
      url: "https://www.ligue1.com",
      display: "ligue1.com",
    },
  ],
  MLS: [
    {
      label: "MLS 공식",
      url: "https://www.mlssoccer.com",
      display: "mlssoccer.com",
    },
  ],
  UCL: [
    {
      label: "UEFA 챔피언스리그 공식",
      url: "https://www.uefa.com/uefachampionsleague",
      display: "uefa.com",
    },
  ],
  WORLD_CUP: [
    {
      label: "FIFA 월드컵 공식",
      url: "https://www.fifa.com/fifaplus/en/tournaments/mens/worldcup/canadamexicousa2026",
      display: "fifa.com",
    },
    {
      label: "Elo 랭킹",
      url: "https://www.eloratings.net",
      display: "eloratings.net",
    },
  ],
};

export function getExternalLinks(league: string): ExternalLink[] {
  return EXTERNAL_SOURCES_BY_LEAGUE[league] ?? [];
}
