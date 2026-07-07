// 리그 로고(마크) URL 해석 — 리그 페이지 헤더·사이드바 등에서 국기 대신 리그 마크 표시.
// 축구/UCL/월드컵 = api-football 리그 로고, 북미 3대 = ESPN 리그 로고. 없으면 null → 국기 폴백.
import { API_FOOTBALL_LEAGUE_ID } from "./api-football-pro";

// api-football 이 커버 못 하는 종목의 리그 로고 (ESPN CDN — 검증된 안정 URL).
const NON_FOOTBALL_LEAGUE_LOGO: Record<string, string> = {
  NBA: "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  NHL: "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  MLB: "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
};

/** 리그 코드 → 로고 URL. 없으면 null. */
export function leagueLogoUrl(league: string): string | null {
  if (NON_FOOTBALL_LEAGUE_LOGO[league]) return NON_FOOTBALL_LEAGUE_LOGO[league];
  const id = API_FOOTBALL_LEAGUE_ID[league];
  return id ? `https://media.api-sports.io/football/leagues/${id}.png` : null;
}
