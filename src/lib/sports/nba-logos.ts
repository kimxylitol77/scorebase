// NBA 팀 로고의 단일 진실 — 영문 정식명 → ESPN 공식 로고 URL.
//
// 근본 원인 차단: 과거 NBA 로고는 api-sports 매치 payload 의 externalId/logo 를 그대로 박았는데,
// 중복 row·소스 마이그레이션 과정에서 그 메타데이터가 팀 정체성과 어긋나(예: Golden State row 에
// Denver 로고) 스크램블됐다. 로고를 이름 기준 결정적 매핑으로 고정하면 구조적으로 스크램블 불가.
// collector(라이브 수집)와 복구 스크립트(build-nba-team-logos)가 이 단일 출처를 공유한다.

const ESPN_BASE = "https://a.espncdn.com/i/teamlogos/nba/500";

// 영문 정식명 → ESPN 로고 abbr (gs·no·ny·sa·wsh·utah 등 ESPN 비표준 약어 포함, 30팀 전부 200 검증).
export const NBA_ESPN_ABBR: Record<string, string> = {
  "Atlanta Hawks": "atl",
  "Boston Celtics": "bos",
  "Brooklyn Nets": "bkn",
  "Charlotte Hornets": "cha",
  "Chicago Bulls": "chi",
  "Cleveland Cavaliers": "cle",
  "Dallas Mavericks": "dal",
  "Denver Nuggets": "den",
  "Detroit Pistons": "det",
  "Golden State Warriors": "gs",
  "Houston Rockets": "hou",
  "Indiana Pacers": "ind",
  "LA Clippers": "lac",
  "Los Angeles Clippers": "lac",
  "Los Angeles Lakers": "lal",
  "Memphis Grizzlies": "mem",
  "Miami Heat": "mia",
  "Milwaukee Bucks": "mil",
  "Minnesota Timberwolves": "min",
  "New Orleans Pelicans": "no",
  "New York Knicks": "ny",
  "Oklahoma City Thunder": "okc",
  "Orlando Magic": "orl",
  "Philadelphia 76ers": "phi",
  "Phoenix Suns": "phx",
  "Portland Trail Blazers": "por",
  "Sacramento Kings": "sac",
  "San Antonio Spurs": "sa",
  "Toronto Raptors": "tor",
  "Utah Jazz": "utah",
  "Washington Wizards": "wsh",
};

/** 영문 팀명 → ESPN 로고 URL. NBA 정식 30팀이 아니면 null (호출측에서 원 소스 fallback). */
export function nbaEspnLogo(name: string | null | undefined): string | null {
  if (!name) return null;
  const abbr = NBA_ESPN_ABBR[name.trim()];
  return abbr ? `${ESPN_BASE}/${abbr}.png` : null;
}
