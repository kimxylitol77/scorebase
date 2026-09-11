// 홈 「오늘 주요 경기 6」 후보 로더(서버 전용) — 순위·쿼터 규칙은 today-matches-rank.ts(순수)에 있고 여기선 DB 에서 후보를 읽어
// 같은 함수로 상위 후보만 자른다. 클라이언트는 rank 모듈만 import 한다.
import { prisma } from "@/lib/db";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { SOCCER_LEAGUES, leagueHasDraw } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";
import { toEnglishTeamName } from "@/lib/i18n/en";
import { matchLiveHref } from "@/lib/links/match-live-link";
import { kstDayWindow } from "@/lib/threads/kst";
import { HOME_CANDIDATE_LIMIT, HOME_MATCH_COUNT, rankTodayMatches, type HomeMatch } from "./today-matches-rank";

export type { HomeMatch } from "./today-matches-rank";

const MATCH_SELECT = {
  id: true, league: true, externalId: true, status: true, startTime: true,
  homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
  oddsHome: true, oddsDraw: true, oddsAway: true,
  predHome: true, predDraw: true, predAway: true,
  homeTeam: { select: { name: true, logoUrl: true } },
  awayTeam: { select: { name: true, logoUrl: true } },
} as const;

type Row = {
  id: number; league: string; externalId: string; status: string; startTime: Date;
  homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null;
  oddsHome: number | null; oddsDraw: number | null; oddsAway: number | null;
  predHome: number | null; predDraw: number | null; predAway: number | null;
  homeTeam: { name: string; logoUrl: string | null }; awayTeam: { name: string; logoUrl: string | null };
};

function toHomeMatch(m: Row, lang: "ko" | "en"): HomeMatch {
  const draw = leagueHasDraw(m.league);
  const name = (raw: string) => (lang === "en" ? toEnglishTeamName(raw) : toKoreanTeamName(raw, m.league)) || raw;
  const odds = m.oddsHome != null && m.oddsAway != null ? { home: m.oddsHome, draw: draw ? m.oddsDraw : null, away: m.oddsAway } : null;
  const prob = m.predHome != null && m.predAway != null ? { home: m.predHome, draw: draw ? m.predDraw : null, away: m.predAway } : null;
  return {
    id: m.id,
    league: m.league,
    href: matchLiveHref(m.league, m.externalId),
    status: m.status,
    startMs: m.startTime.getTime(),
    homeTeamId: m.homeTeamId,
    awayTeamId: m.awayTeamId,
    homeName: name(m.homeTeam.name),
    awayName: name(m.awayTeam.name),
    homeLogo: m.homeTeam.logoUrl,
    awayLogo: m.awayTeam.logoUrl,
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    odds,
    prob,
    soccer: SOCCER_LEAGUES.has(m.league),
  };
}

export interface TodayMatchBlock {
  candidates: HomeMatch[];
  /** 서버가 순위를 매긴 시각 — 클라이언트 첫 렌더가 같은 입력을 쓰게 넘긴다 */
  nowMs: number;
  /** KST 오늘 끝(ms) — 이후 킥오프는 "내일" 표기 */
  todayEndMs: number;
}

/**
 * KST 오늘의 화이트리스트 리그 경기(LIVE·예정·종료). 6개 미만이면 다음 24h 까지 확장(새벽·비시즌 공백).
 * 로드 시각 기준으로 순위를 매겨 상위 HOME_CANDIDATE_LIMIT 개만 돌려준다(클라이언트 재정렬 재료).
 * 시각은 렌더 순수성 규칙(react-hooks/purity) 때문에 컴포넌트가 아니라 여기서 읽는다.
 */
export async function loadTodayMatchCandidates(opts: { lang?: "ko" | "en" } = {}): Promise<TodayMatchBlock> {
  const lang = opts.lang ?? "ko";
  const nowMs = Date.now();
  const { start, end } = kstDayWindow();
  const leagues = [...ARTICLE_LEAGUES];
  const base = { league: { in: leagues }, status: { in: ["SCHEDULED", "LIVE", "FINISHED"] } };
  let rows: Row[] = await prisma.match.findMany({
    where: { ...base, startTime: { gte: start, lt: end } },
    select: MATCH_SELECT,
    take: 200,
  });
  if (rows.length < HOME_MATCH_COUNT) {
    const more: Row[] = await prisma.match.findMany({
      where: { ...base, startTime: { gte: end, lt: new Date(end.getTime() + 24 * 3600 * 1000) } },
      select: MATCH_SELECT,
      orderBy: { startTime: "asc" },
      take: 60,
    });
    rows = [...rows, ...more];
  }
  const all = rows.map((r) => toHomeMatch(r, lang));
  return { candidates: rankTodayMatches(all, nowMs, [], HOME_CANDIDATE_LIMIT), nowMs, todayEndMs: end.getTime() };
}
