// ANALYSIS 글 "이번 주 주목할 전술 포인트 3가지" 데이터 블록 — 향후 7일 내 빅매치 1경기를 골라
// 양 팀 최근 5경기의 포메이션·점유율/슈팅/파울(템포·압박 성향)·코너(세트피스)·xG 를
// 사람이 읽는 텍스트로 조립한다. 값이 없는 항목은 주입하지 않는다(창작 방지).
// 압박 강도 직접 지표(PPDA)는 보유하지 않으므로 프롬프트에 그 사실을 명시한다.

import { prisma } from "@/lib/db";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import type { PredictMatch } from "@/lib/predict/types";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { parseFormation } from "./data-gate";

const WINDOW_DAYS = 7;
const RECENT_N = 5;
/** 양 팀 모두 스탯이 있는 최근 경기가 이 수 이상이어야 섹션을 붙인다. */
const MIN_STAT_GAMES = 3;

interface SideStats {
  possessionPct?: number | null;
  shotsTotal?: number | null;
  fouls?: number | null;
  cornerKicks?: number | null;
  expectedGoals?: number | null;
}

interface TeamProfile {
  name: string;
  games: number; // 최근 종료 경기 수(최대 RECENT_N)
  formations: { formation: string; count: number }[]; // 최다 사용 순
  statGames: number; // 점유·슈팅 스탯이 있는 경기 수
  possession: number | null;
  shotsFor: number | null;
  shotsAgainst: number | null;
  fouls: number | null;
  cornersFor: number | null;
  cornersAgainst: number | null;
  xgGames: number;
  xgFor: number | null;
  xgAgainst: number | null;
  results: string; // "WDLWW" 최근순
}

export interface TacticalPointsBlock {
  matchId: number;
  home: string;
  away: string;
  /** 프롬프트 [입력 데이터] 에 그대로 넣는 텍스트. */
  text: string;
}

function avg(xs: number[]): number | null {
  return xs.length > 0 ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}
const f1 = (x: number | null) => (x == null ? null : x.toFixed(1));

/** fixtureStats JSON([home, away]) 파싱 — 손상·형식 불일치는 null. */
function parseSides(fixtureStats: string | null): [SideStats, SideStats] | null {
  if (!fixtureStats) return null;
  try {
    const arr = JSON.parse(fixtureStats) as SideStats[];
    if (Array.isArray(arr) && arr.length === 2) return [arr[0] ?? {}, arr[1] ?? {}];
  } catch {
    // 손상 JSON
  }
  return null;
}

async function buildProfile(teamId: number, league: string, name: string, before: Date): Promise<TeamProfile> {
  const recent = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { lt: before }, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    orderBy: { startTime: "desc" },
    take: RECENT_N,
    select: {
      homeTeamId: true, homeScore: true, awayScore: true,
      lineupHome: true, lineupAway: true, fixtureStats: true,
      matchStats: { select: { homePossession: true, awayPossession: true, homeShots: true, awayShots: true, homeCorners: true, awayCorners: true } },
    },
  });

  const formCount = new Map<string, number>();
  const poss: number[] = [], shotsFor: number[] = [], shotsAgainst: number[] = [], fouls: number[] = [];
  const cornersFor: number[] = [], cornersAgainst: number[] = [], xgFor: number[] = [], xgAgainst: number[] = [];
  let statGames = 0;
  const results: string[] = [];

  for (const m of recent) {
    const isHome = m.homeTeamId === teamId;
    const gf = isHome ? m.homeScore : m.awayScore;
    const ga = isHome ? m.awayScore : m.homeScore;
    if (gf != null && ga != null) results.push(gf > ga ? "W" : gf < ga ? "L" : "D");

    const formation = parseFormation(isHome ? m.lineupHome : m.lineupAway);
    if (formation) formCount.set(formation, (formCount.get(formation) ?? 0) + 1);

    const sides = parseSides(m.fixtureStats);
    const us = sides ? sides[isHome ? 0 : 1] : null;
    const them = sides ? sides[isHome ? 1 : 0] : null;
    // 점유·슈팅·코너는 fixtureStats 우선, 없으면 MatchStats(ts) 폴백.
    const possession = us?.possessionPct ?? (isHome ? m.matchStats?.homePossession : m.matchStats?.awayPossession) ?? null;
    const sFor = us?.shotsTotal ?? (isHome ? m.matchStats?.homeShots : m.matchStats?.awayShots) ?? null;
    const sAgainst = them?.shotsTotal ?? (isHome ? m.matchStats?.awayShots : m.matchStats?.homeShots) ?? null;
    const cFor = us?.cornerKicks ?? (isHome ? m.matchStats?.homeCorners : m.matchStats?.awayCorners) ?? null;
    const cAgainst = them?.cornerKicks ?? (isHome ? m.matchStats?.awayCorners : m.matchStats?.homeCorners) ?? null;
    if (possession != null || sFor != null) statGames++;
    if (possession != null) poss.push(possession);
    if (sFor != null) shotsFor.push(sFor);
    if (sAgainst != null) shotsAgainst.push(sAgainst);
    if (us?.fouls != null) fouls.push(us.fouls);
    if (cFor != null) cornersFor.push(cFor);
    if (cAgainst != null) cornersAgainst.push(cAgainst);
    if (us?.expectedGoals != null && them?.expectedGoals != null) {
      xgFor.push(us.expectedGoals);
      xgAgainst.push(them.expectedGoals);
    }
  }

  return {
    name,
    games: recent.length,
    formations: [...formCount.entries()].map(([formation, count]) => ({ formation, count })).sort((a, b) => b.count - a.count),
    statGames,
    possession: avg(poss),
    shotsFor: avg(shotsFor),
    shotsAgainst: avg(shotsAgainst),
    fouls: avg(fouls),
    cornersFor: avg(cornersFor),
    cornersAgainst: avg(cornersAgainst),
    xgGames: xgFor.length,
    xgFor: avg(xgFor),
    xgAgainst: avg(xgAgainst),
    results: results.join(""),
  };
}

function profileLines(p: TeamProfile): string[] {
  const out: string[] = [];
  out.push(` [${p.name}] 최근 ${p.games}경기 ${p.results}`);
  if (p.formations.length > 0) {
    const known = p.formations.reduce((s, f) => s + f.count, 0);
    out.push(`  - 포메이션(${known}경기 확인): ${p.formations.map((f) => `${f.formation} ${f.count}회`).join(", ")}`);
  }
  const tempo: string[] = [];
  if (p.possession != null) tempo.push(`평균 점유율 ${p.possession.toFixed(0)}%`);
  if (p.shotsFor != null) tempo.push(`슈팅 ${f1(p.shotsFor)}개`);
  if (p.shotsAgainst != null) tempo.push(`피슈팅 ${f1(p.shotsAgainst)}개`);
  if (p.fouls != null) tempo.push(`파울 ${f1(p.fouls)}개`);
  if (tempo.length > 0) out.push(`  - 템포·압박 성향(경기당): ${tempo.join(", ")}`);
  if (p.cornersFor != null || p.cornersAgainst != null) {
    const c: string[] = [];
    if (p.cornersFor != null) c.push(`획득 ${f1(p.cornersFor)}개`);
    if (p.cornersAgainst != null) c.push(`허용 ${f1(p.cornersAgainst)}개`);
    out.push(`  - 코너킥(경기당): ${c.join(", ")}`);
  }
  // xG 는 1~2경기 평균이면 한 경기 값이 그대로 튀어 나오므로 3경기부터만 준다.
  if (p.xgFor != null && p.xgAgainst != null && p.xgGames >= MIN_STAT_GAMES) {
    out.push(`  - xG(경기당, ${p.xgGames}경기): 생산 ${p.xgFor.toFixed(2)} / 허용 ${p.xgAgainst.toFixed(2)}`);
  }
  return out;
}

/**
 * 리그의 향후 7일 내 예정 경기 중 Elo 합이 가장 높은 1경기를 골라 전술 포인트 데이터 블록을 만든다.
 * 축구가 아니거나, 대상 경기가 없거나, 양 팀 스탯이 얇으면 null(섹션 미부착).
 */
export async function buildTacticalPointsBlock(
  league: string,
  matches: PredictMatch[],
  teamName: (id: number) => string,
  now: Date = new Date(),
): Promise<TacticalPointsBlock | null> {
  if (!SOCCER_LEAGUES.has(league)) return null;
  const until = now.getTime() + WINDOW_DAYS * 86400_000;
  const upcoming = matches.filter(
    (m) => m.status === "SCHEDULED" && m.startTime.getTime() > now.getTime() && m.startTime.getTime() < until,
  );
  if (upcoming.length === 0) return null;

  const elo = calcEloTable(matches);
  const target = upcoming
    .map((m) => ({ m, sum: getElo(elo, m.homeTeamId) + getElo(elo, m.awayTeamId) }))
    .sort((a, b) => b.sum - a.sum)[0].m;

  const home = await buildProfile(target.homeTeamId, league, teamName(target.homeTeamId), target.startTime);
  const away = await buildProfile(target.awayTeamId, league, teamName(target.awayTeamId), target.startTime);
  // 게이트 — 양 팀 스탯 경기 3 이상 + 포메이션 최소 1경기 확인. 미달이면 얇은 서술이 되므로 붙이지 않는다.
  if (home.statGames < MIN_STAT_GAMES || away.statGames < MIN_STAT_GAMES) return null;
  if (home.formations.length === 0 || away.formations.length === 0) return null;

  const kst = target.startTime.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const lines: string[] = [];
  lines.push(`[전술 포인트 데이터 — 다가오는 빅매치] ${home.name}(홈) vs ${away.name}(원정), ${kst} KST`);
  lines.push(...profileLines(home));
  lines.push(...profileLines(away));
  lines.push(" (주의) 압박 강도를 직접 측정한 지표(PPDA 등)와 세트피스 득점 수는 보유하지 않음 — 위 점유율·피슈팅·파울·코너 수치로 성향만 서술할 것");

  return { matchId: target.id, home: home.name, away: away.name, text: lines.join("\n") };
}
