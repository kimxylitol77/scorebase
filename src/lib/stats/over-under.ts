// 축구 리그·팀별 오버/언더 집계 — /over-under 페이지의 단일 데이터 소스.
//
// 오버 2.5 는 "한 경기 총득점이 3골 이상"을 뜻한다. 언더는 그 여집합이라 따로 계산하지 않고
// 같은 표를 역순으로 읽는다.
//
// 집계 범위 (docs/over-under/context-notes.md 의 결정 3).
//   - 축구만. 야구·농구는 총득점 스케일이 달라 오버 2.5 가 무의미하다(NBA 100%, MLB 96%).
//   - 컵·친선 제외. 팀당 평균 경기 수가 적어 비율이 튄다(CLUB_FRIENDLY 는 938팀에 1,550경기).
//   - 기간을 자르지 않고 보유한 FINISHED 경기를 전부 쓴다. 데이터가 쌓이면 표본이 자연히 늘어난다.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";

/** 리그가 표에 오르기 위한 최소 조건 — 컵·친선을 걸러내는 기준이기도 하다. */
const MIN_LEAGUE_MATCHES = 30;
const MIN_MATCHES_PER_TEAM = 10;
/** 팀 행을 표시할 최소 경기 수. 이보다 적으면 비율이 튀어 순위가 무의미해진다. */
const MIN_TEAM_MATCHES = 8;

/** 집계 로직을 바꾸면 이 값을 올린다 — unstable_cache 는 배포 사이에도 살아남는다. */
const CACHE_V = "v2"; // v2 — 날짜를 ISO 문자열로 바꿈(캐시 직렬화 호환)
const REVALIDATE_SEC = 1800;

export interface TeamOverUnder {
  teamId: number;
  name: string;
  nameKo: string;
  logoUrl: string | null;
  matches: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number; // 양 팀 모두 득점
  goalsFor: number;
  goalsAgainst: number;
  homeMatches: number;
  homeOver25: number;
  awayMatches: number;
  awayOver25: number;
}

export interface LeagueOverUnder {
  league: string;
  matches: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  goals: number;
  /** ISO 문자열 — unstable_cache 가 JSON 직렬화를 거쳐 Date 를 문자열로 바꾸므로 처음부터 문자열로 둔다. */
  firstAt: string;
  lastAt: string;
  teams: TeamOverUnder[];
}

export interface LeagueSummary {
  league: string;
  matches: number;
  over25Pct: number;
  over15Pct: number;
  over35Pct: number;
  bttsPct: number;
  goalsPerMatch: number;
  teams: number;
  /** ISO 문자열 — 위와 같은 이유. */
  lastAt: string;
}

interface TeamRow {
  teamId: number;
  name: string;
  logoUrl: string | null;
  matches: number;
  over15: number;
  over25: number;
  over35: number;
  btts: number;
  goalsFor: number;
  goalsAgainst: number;
  homeMatches: number;
  homeOver25: number;
  awayMatches: number;
  awayOver25: number;
}

/**
 * 한 리그의 팀별 오버/언더. 캐시를 거치지 않는 원본 — 스크립트 검증에서 직접 호출한다.
 * 홈 경기와 원정 경기를 UNION 으로 합쳐 팀 시점으로 뒤집은 뒤 집계한다.
 */
export async function computeLeagueOverUnder(league: string): Promise<LeagueOverUnder | null> {
  const rows = await prisma.$queryRawUnsafe<TeamRow[]>(
    `
    WITH g AS (
      SELECT m."homeTeamId" AS "teamId", m."homeScore" + m."awayScore" AS tot,
             m."homeScore" AS gf, m."awayScore" AS ga, TRUE AS is_home
        FROM "Match" m
       WHERE m.league = $1 AND m.status = 'FINISHED'
         AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
      UNION ALL
      SELECT m."awayTeamId", m."homeScore" + m."awayScore",
             m."awayScore", m."homeScore", FALSE
        FROM "Match" m
       WHERE m.league = $1 AND m.status = 'FINISHED'
         AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
    )
    SELECT g."teamId", t.name, t."logoUrl",
           COUNT(*)::int AS matches,
           SUM(CASE WHEN tot > 1 THEN 1 ELSE 0 END)::int AS over15,
           SUM(CASE WHEN tot > 2 THEN 1 ELSE 0 END)::int AS over25,
           SUM(CASE WHEN tot > 3 THEN 1 ELSE 0 END)::int AS over35,
           SUM(CASE WHEN gf > 0 AND ga > 0 THEN 1 ELSE 0 END)::int AS btts,
           SUM(gf)::int AS "goalsFor",
           SUM(ga)::int AS "goalsAgainst",
           SUM(CASE WHEN is_home THEN 1 ELSE 0 END)::int AS "homeMatches",
           SUM(CASE WHEN is_home AND tot > 2 THEN 1 ELSE 0 END)::int AS "homeOver25",
           SUM(CASE WHEN NOT is_home THEN 1 ELSE 0 END)::int AS "awayMatches",
           SUM(CASE WHEN NOT is_home AND tot > 2 THEN 1 ELSE 0 END)::int AS "awayOver25"
      FROM g JOIN "Team" t ON t.id = g."teamId"
     GROUP BY g."teamId", t.name, t."logoUrl"
    HAVING COUNT(*) >= ${MIN_TEAM_MATCHES}
     ORDER BY (SUM(CASE WHEN tot > 2 THEN 1 ELSE 0 END)::float / COUNT(*)) DESC
    `,
    league,
  );
  if (!rows.length) return null;

  const agg = await prisma.$queryRawUnsafe<
    Array<{ matches: number; over15: number; over25: number; over35: number; btts: number; goals: number; first: Date; last: Date }>
  >(
    `
    SELECT COUNT(*)::int AS matches,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 1 THEN 1 ELSE 0 END)::int AS over15,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 2 THEN 1 ELSE 0 END)::int AS over25,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 3 THEN 1 ELSE 0 END)::int AS over35,
           SUM(CASE WHEN "homeScore" > 0 AND "awayScore" > 0 THEN 1 ELSE 0 END)::int AS btts,
           SUM("homeScore" + "awayScore")::int AS goals,
           MIN("startTime") AS first, MAX("startTime") AS last
      FROM "Match"
     WHERE league = $1 AND status = 'FINISHED'
       AND "homeScore" IS NOT NULL AND "awayScore" IS NOT NULL
    `,
    league,
  );
  const a = agg[0];
  if (!a || a.matches < MIN_LEAGUE_MATCHES) return null;

  return {
    league,
    matches: a.matches,
    over15: a.over15,
    over25: a.over25,
    over35: a.over35,
    btts: a.btts,
    goals: a.goals,
    firstAt: new Date(a.first).toISOString(),
    lastAt: new Date(a.last).toISOString(),
    teams: rows.map((r) => ({
      ...r,
      nameKo: toKoreanTeamName(r.name, league),
    })),
  };
}

/** 리그 전체 요약 — 허브 페이지용. 컵·친선은 팀당 경기 수 기준으로 걸러낸다. */
export async function computeAllLeaguesOverUnder(): Promise<LeagueSummary[]> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      league: string; matches: number; over15: number; over25: number; over35: number;
      btts: number; goals: number; teams: number; last: Date;
    }>
  >(
    `
    SELECT league,
           COUNT(*)::int AS matches,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 1 THEN 1 ELSE 0 END)::int AS over15,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 2 THEN 1 ELSE 0 END)::int AS over25,
           SUM(CASE WHEN ("homeScore" + "awayScore") > 3 THEN 1 ELSE 0 END)::int AS over35,
           SUM(CASE WHEN "homeScore" > 0 AND "awayScore" > 0 THEN 1 ELSE 0 END)::int AS btts,
           SUM("homeScore" + "awayScore")::int AS goals,
           COUNT(DISTINCT "homeTeamId")::int AS teams,
           MAX("startTime") AS last
      FROM "Match"
     WHERE status = 'FINISHED' AND "homeScore" IS NOT NULL AND "awayScore" IS NOT NULL
       AND league = ANY($1::text[])
     GROUP BY league
    HAVING COUNT(*) >= ${MIN_LEAGUE_MATCHES}
    `,
    [...SOCCER_LEAGUES],
  );

  return rows
    // 팀당 평균 경기 수가 적으면 컵·친선·예선이다. 팀 단위 비율이 튀므로 제외한다.
    .filter((r) => r.teams > 0 && (r.matches * 2) / r.teams >= MIN_MATCHES_PER_TEAM)
    .map((r) => ({
      league: r.league,
      matches: r.matches,
      over25Pct: (r.over25 / r.matches) * 100,
      over15Pct: (r.over15 / r.matches) * 100,
      over35Pct: (r.over35 / r.matches) * 100,
      bttsPct: (r.btts / r.matches) * 100,
      goalsPerMatch: r.goals / r.matches,
      teams: r.teams,
      lastAt: new Date(r.last).toISOString(),
    }))
    .sort((a, b) => b.over25Pct - a.over25Pct);
}

export const getLeagueOverUnder = (league: string) =>
  unstable_cache(() => computeLeagueOverUnder(league), ["over-under-league", CACHE_V, league], {
    revalidate: REVALIDATE_SEC,
  })();

export const getAllLeaguesOverUnder = unstable_cache(
  computeAllLeaguesOverUnder,
  ["over-under-all", CACHE_V],
  { revalidate: REVALIDATE_SEC },
);

/** 오버/언더 계열 지표를 퍼센트로. 분모 0 방어. */
export const pct = (part: number, total: number) => (total ? (part / total) * 100 : 0);

/**
 * 받침 유무에 따라 조사를 고른다 — "뮌헨로"처럼 어긋나는 문장을 막는다.
 * 한글이 아니면(영문 팀명 등) 받침 있는 쪽을 쓴다.
 */
export function josa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return withBatchim;
  return (code - 0xac00) % 28 === 0 ? withoutBatchim : withBatchim;
}
