// 분석 게시판 예측용 — 종목별 "예정 경기(SCHEDULED, 미래)" 목록.
// 글 작성 폼에서 종목→날짜→리그→경기 계층 선택에 사용.
// 팀명은 한글(toKoreanTeamName), 리그는 한글 라벨, 배당 line(핸디캡/OU) 포함.

import "server-only";
import { prisma } from "@/lib/db";
import { type SportCode, leaguesForSport } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";

// 분석 폼용 리그 한글 라벨 (메이저 위주, 미등록은 코드 그대로).
const LEAGUE_KO: Record<string, string> = {
  EPL: "EPL",
  LALIGA: "라리가",
  BUNDESLIGA: "분데스리가",
  SERIE_A: "세리에A",
  LIGUE_1: "리그1",
  UCL: "챔피언스리그",
  UEL: "유로파리그",
  UECL: "컨퍼런스리그",
  MLS: "MLS",
  CHAMPIONSHIP: "챔피언십",
  EREDIVISIE: "에레디비시",
  PRIMEIRA_LIGA: "프리메이라리가",
  SAUDI_PL: "사우디 PL",
  K_LEAGUE_1: "K리그1",
  K_LEAGUE_2: "K리그2",
  J1_LEAGUE: "J1리그",
  J2_LEAGUE: "J2리그",
  AFC_CL: "AFC 챔스",
  LIGA_MX: "리가 MX",
  BRASILEIRAO: "브라질 세리에A",
  ARGENTINA_PL: "아르헨티나",
  WORLD_CUP: "월드컵",
  AFCON: "아프리카 네이션스컵",
  KBO: "KBO",
  NPB: "NPB",
  MLB: "MLB",
  CPBL: "CPBL",
  LMB: "LMB",
  NBA: "NBA",
  WNBA: "WNBA",
  KBL: "KBL",
  WKBL: "WKBL",
  NHL: "NHL",
  IIHF_WC: "세계선수권",
  LOL: "LCK",
};

export function leagueLabel(code: string): string {
  return LEAGUE_KO[code] ?? code;
}

export interface UpcomingMatch {
  id: number;
  league: string;
  leagueLabel: string;
  startTime: Date;
  home: string;
  away: string;
  // 마켓별 기준선 — 배당이 있을 때만 채워짐(없으면 null → 해당 마켓 비활성)
  hcLine: number | null; // 핸디캡 (홈팀 기준)
  ouLine: number | null; // 오버언더 총득점
  // 실제 시장 배당 (The Odds API) — 메이저 경기만 있고 마이너는 null → 버튼에 있을 때만 표시
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
}

// 배당 없는 경기(국제친선·마이너 리그 등)용 종목별 기본 기준선 — 게시판에서 핸디/OU 픽 허용.
// The Odds API 가 친선 배당을 안 줘서 hcLine/ouLine 이 null → 표준 라인으로 fallback.
const DEFAULT_HC_LINE: Record<SportCode, number> = {
  soccer: -1.5,
  baseball: -1.5,
  basketball: -5.5,
  hockey: -1.5,
  esports: -1.5,
  mma: 0,
  all: 0,
};
const DEFAULT_OU_LINE: Record<SportCode, number> = {
  soccer: 2.5,
  baseball: 8.5,
  basketball: 220.5,
  hockey: 5.5,
  esports: 2.5,
  mma: 0,
  all: 0,
};

/**
 * 종목의 예정 경기 목록 (시작 임박 순). 날짜·리그 그룹핑은 클라이언트에서.
 * @param sport soccer | baseball | basketball | hockey
 */
export async function getUpcomingMatchesForSport(
  sport: SportCode,
  limit = 120,
): Promise<UpcomingMatch[]> {
  const leagues = leaguesForSport(sport);
  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      status: "SCHEDULED",
      startTime: { gte: new Date() },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      oddsHcLine: true,
      oddsTotalLine: true,
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
      oddsHcHome: true,
      oddsHcAway: true,
      oddsOver: true,
      oddsUnder: true,
    },
    orderBy: { startTime: "asc" },
    take: limit,
  });
  return matches.map((m) => ({
    id: m.id,
    league: m.league,
    leagueLabel: leagueLabel(m.league),
    startTime: m.startTime,
    home: toKoreanTeamName(m.homeTeam.name, m.league),
    away: toKoreanTeamName(m.awayTeam.name, m.league),
    hcLine: m.oddsHcLine ?? DEFAULT_HC_LINE[sport],
    ouLine: m.oddsTotalLine ?? DEFAULT_OU_LINE[sport],
    oddsHome: m.oddsHome,
    oddsDraw: m.oddsDraw,
    oddsAway: m.oddsAway,
    oddsHcHome: m.oddsHcHome,
    oddsHcAway: m.oddsHcAway,
    oddsOver: m.oddsOver,
    oddsUnder: m.oddsUnder,
  }));
}
