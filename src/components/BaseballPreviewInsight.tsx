// 야구 PREVIEW 매치 인사이트 server wrapper.
// articles/[slug] 페이지의 KBO/NPB/MLB PREVIEW 글에서 호출.
//
// 데이터 prep 후 BaseballPreviewInsightTabs(client) 로 props 전달.

import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { calcEloTable, getElo } from "@/lib/predict/elo";
import { calcH2H } from "@/lib/predict/h2h";
import { calcRecentTrend } from "@/lib/predict/recent-trend";
import { calcSeasonStats } from "@/lib/predict/season-stats";
import { calcWinProbability } from "@/lib/predict/win-probability";
import { kboPhotoUrl } from "@/lib/sports/kbo-official";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { fetchNpbPhotoUrl } from "@/lib/sports/npb-official";
import type { PredictMatch } from "@/lib/predict/types";
import BaseballPreviewInsightTabs, {
  type PreviewStarterInfo,
  type PreviewSeasonSide,
  type PreviewRecentMatchRow,
  type PreviewH2HRecentRow,
  type PreviewInningProb,
} from "./BaseballPreviewInsightTabs";

interface InsightMatch {
  id: number;
  league: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: { id: number; name: string; logoUrl?: string | null };
  awayTeam: { id: number; name: string; logoUrl?: string | null };
  homeStarter?: string | null;
  awayStarter?: string | null;
}

interface Props {
  match: InsightMatch;
  league: "KBO" | "NPB" | "MLB";
  /** article.baseballContext JSON 문자열 (이미 parsed 된 객체일 수도) */
  baseballContext?: string | null;
}

function parseStarter(s?: string | null): PreviewStarterInfo | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as PreviewStarterInfo;
  } catch {
    return null;
  }
}

function fmtDate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${m}/${day}`;
}

function starterPhoto(
  league: "KBO" | "NPB" | "MLB",
  pid: number | string | null | undefined,
  npbFetched?: string | null,
): string | null {
  if (pid == null || pid === "") return null;
  if (league === "KBO") return kboPhotoUrl(pid);
  if (league === "MLB") {
    const id = typeof pid === "string" ? Number(pid) : pid;
    if (Number.isFinite(id)) return mlbHeadshotUrl(id);
    return null;
  }
  return npbFetched ?? null;
}

function starterHref(
  league: "KBO" | "NPB" | "MLB",
  pid: number | string | null | undefined,
): string | null {
  if (pid == null || pid === "") return null;
  if (league === "KBO") return `/players/${pid}?league=KBO`;
  if (league === "NPB") return `/players/${pid}?league=NPB`;
  return `/players/${pid}`;
}

function teamSideFromStats(
  stats: ReturnType<typeof calcSeasonStats>,
  teamId: number,
  rank: number | null,
): PreviewSeasonSide {
  const s = stats.get(teamId);
  if (!s) {
    return {
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      runsFor: 0,
      runsAgainst: 0,
      winPct: 0,
      avgRunsFor: 0,
      avgRunsAgainst: 0,
      rank: null,
    };
  }
  // calcSeasonStats 는 goalsFor/Against 만 채워준다. 승/패 / draws 는 직접 카운트해야 — 이 함수는 별도 처리에서.
  return {
    played: s.played,
    wins: 0,
    losses: 0,
    draws: 0,
    runsFor: s.goalsFor,
    runsAgainst: s.goalsAgainst,
    winPct: 0,
    avgRunsFor: s.avgGoalsFor,
    avgRunsAgainst: s.avgGoalsAgainst,
    rank,
  };
}

/** 한 팀의 시즌 승/패/무 카운트. 야구는 draws 거의 없음. */
function calcWLD(matches: PredictMatch[], teamId: number, beforeTime: Date) {
  let w = 0, l = 0, d = 0;
  for (const m of matches) {
    if (m.status !== "FINISHED" || m.homeScore == null || m.awayScore == null) continue;
    if (m.startTime.getTime() >= beforeTime.getTime()) continue;
    const isHome = m.homeTeamId === teamId;
    const isAway = m.awayTeamId === teamId;
    if (!isHome && !isAway) continue;
    const my = isHome ? m.homeScore : m.awayScore;
    const opp = isHome ? m.awayScore : m.homeScore;
    if (my > opp) w++;
    else if (my < opp) l++;
    else d++;
  }
  return { wins: w, losses: l, draws: d };
}

/** 시즌 stats winPct 기준으로 모든 팀 rank. tie 면 같은 rank. */
function buildRankMap(
  matches: PredictMatch[],
  beforeTime: Date,
): { rank: Map<number, number>; totalTeams: number } {
  const teamIds = new Set<number>();
  for (const m of matches) {
    teamIds.add(m.homeTeamId);
    teamIds.add(m.awayTeamId);
  }
  const items: Array<{ teamId: number; winPct: number; played: number }> = [];
  for (const tid of teamIds) {
    const wld = calcWLD(matches, tid, beforeTime);
    const played = wld.wins + wld.losses + wld.draws;
    if (played === 0) continue;
    const winPct = wld.wins / (wld.wins + wld.losses || 1);
    items.push({ teamId: tid, winPct, played });
  }
  items.sort((a, b) => b.winPct - a.winPct);
  const rank = new Map<number, number>();
  let prev = -1;
  let prevRank = 0;
  items.forEach((it, idx) => {
    if (Math.abs(it.winPct - prev) < 1e-9) {
      rank.set(it.teamId, prevRank);
    } else {
      rank.set(it.teamId, idx + 1);
      prevRank = idx + 1;
      prev = it.winPct;
    }
  });
  return { rank, totalTeams: items.length };
}

function buildRecentRows(
  matches: PredictMatch[],
  teamId: number,
  beforeTime: Date,
  teamNameById: Map<number, string>,
  league: string,
  n: number,
): PreviewRecentMatchRow[] {
  const recent = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < beforeTime.getTime() &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, n);

  return recent.map((m) => {
    const isHome = m.homeTeamId === teamId;
    const oppId = isHome ? m.awayTeamId : m.homeTeamId;
    const my = isHome ? m.homeScore! : m.awayScore!;
    const opp = isHome ? m.awayScore! : m.homeScore!;
    const result: "W" | "L" | "D" =
      my > opp ? "W" : my < opp ? "L" : "D";
    const oppRaw = teamNameById.get(oppId) ?? `Team ${oppId}`;
    return {
      matchId: m.id,
      date: fmtDate(m.startTime),
      opponentNameKo: toKoreanTeamName(oppRaw, league),
      isHome,
      myScore: my,
      oppScore: opp,
      result,
    };
  });
}

function buildH2HRows(
  matches: PredictMatch[],
  homeId: number,
  awayId: number,
  beforeTime: Date,
  teamNameById: Map<number, string>,
  league: string,
  n: number,
): PreviewH2HRecentRow[] {
  const involving = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < beforeTime.getTime() &&
        ((m.homeTeamId === homeId && m.awayTeamId === awayId) ||
          (m.homeTeamId === awayId && m.awayTeamId === homeId)),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, n);

  return involving.map((m) => {
    const homeRaw = teamNameById.get(m.homeTeamId) ?? `Team ${m.homeTeamId}`;
    const awayRaw = teamNameById.get(m.awayTeamId) ?? `Team ${m.awayTeamId}`;
    return {
      matchId: m.id,
      date: fmtDate(m.startTime),
      homeNameKo: toKoreanTeamName(homeRaw, league),
      awayNameKo: toKoreanTeamName(awayRaw, league),
      homeScore: m.homeScore!,
      awayScore: m.awayScore!,
    };
  });
}

interface BaseballContextShape {
  inningScoreProbs?: Array<{ inning: number; team1: number; team2: number }>;
  totalExpectedRuns?: { team1: number; team2: number };
  winProbPoisson?: { team1: number; team2: number };
}

export default async function BaseballPreviewInsight({
  match,
  league,
  baseballContext,
}: Props) {
  // === 1. 같은 리그 모든 매치 가져오기 ===
  const dbMatches = await prisma.match.findMany({
    where: { league: match.league },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const predictMatches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));

  // === 2. 팀 이름 map (이 리그에 등장하는 모든 팀) ===
  const teamIds = new Set<number>();
  for (const m of predictMatches) {
    teamIds.add(m.homeTeamId);
    teamIds.add(m.awayTeamId);
  }
  teamIds.add(match.homeTeam.id);
  teamIds.add(match.awayTeam.id);
  const teams = await prisma.team.findMany({
    where: { id: { in: Array.from(teamIds) } },
    select: { id: true, name: true },
  });
  const teamNameById = new Map<number, string>();
  for (const t of teams) teamNameById.set(t.id, t.name);

  const referenceTime = match.startTime;
  const homeId = match.homeTeam.id;
  const awayId = match.awayTeam.id;
  const homeNameKo = toKoreanTeamName(match.homeTeam.name, match.league);
  const awayNameKo = toKoreanTeamName(match.awayTeam.name, match.league);

  // === 3. 시즌 누적 ===
  const seasonStats = calcSeasonStats(predictMatches, referenceTime);
  const { rank, totalTeams } = buildRankMap(predictMatches, referenceTime);
  const homeWLD = calcWLD(predictMatches, homeId, referenceTime);
  const awayWLD = calcWLD(predictMatches, awayId, referenceTime);

  const homeSeasonBase = teamSideFromStats(
    seasonStats,
    homeId,
    rank.get(homeId) ?? null,
  );
  const awaySeasonBase = teamSideFromStats(
    seasonStats,
    awayId,
    rank.get(awayId) ?? null,
  );
  const homeSeason: PreviewSeasonSide = {
    ...homeSeasonBase,
    wins: homeWLD.wins,
    losses: homeWLD.losses,
    draws: homeWLD.draws,
    winPct:
      homeWLD.wins + homeWLD.losses > 0
        ? homeWLD.wins / (homeWLD.wins + homeWLD.losses)
        : 0,
  };
  const awaySeason: PreviewSeasonSide = {
    ...awaySeasonBase,
    wins: awayWLD.wins,
    losses: awayWLD.losses,
    draws: awayWLD.draws,
    winPct:
      awayWLD.wins + awayWLD.losses > 0
        ? awayWLD.wins / (awayWLD.wins + awayWLD.losses)
        : 0,
  };

  // === 4. 최근 5경기 trend + rows ===
  const homeTrend = calcRecentTrend(predictMatches, homeId, referenceTime, 5);
  const awayTrend = calcRecentTrend(predictMatches, awayId, referenceTime, 5);
  const homeRecentRows = buildRecentRows(
    predictMatches,
    homeId,
    referenceTime,
    teamNameById,
    match.league,
    5,
  );
  const awayRecentRows = buildRecentRows(
    predictMatches,
    awayId,
    referenceTime,
    teamNameById,
    match.league,
    5,
  );

  // === 5. H2H ===
  const h2hSummary = calcH2H(predictMatches, homeId, awayId, referenceTime, 5);
  const h2hRows = buildH2HRows(
    predictMatches,
    homeId,
    awayId,
    referenceTime,
    teamNameById,
    match.league,
    5,
  );

  // === 6. AI 예측 (Elo + winProb + baseballContext) ===
  const beforeMatches = predictMatches.filter(
    (m) => m.startTime.getTime() < referenceTime.getTime(),
  );
  const eloTable = calcEloTable(beforeMatches);
  const homeElo = getElo(eloTable, homeId);
  const awayElo = getElo(eloTable, awayId);
  const winProb = calcWinProbability(homeElo, awayElo, match.league);
  // 야구는 draw 거의 없음 — home/away 만 사용

  let inningProbs: PreviewInningProb[] | undefined;
  let totalExpectedRuns: { team1: number; team2: number } | undefined;
  if (baseballContext) {
    try {
      const bc = JSON.parse(baseballContext) as BaseballContextShape;
      if (bc.inningScoreProbs && bc.inningScoreProbs.length) {
        // baseballContext.inningScoreProbs: team1=home, team2=away (build-context 패턴)
        inningProbs = bc.inningScoreProbs.map((p) => ({
          inning: p.inning,
          homeRuns: p.team1,
          awayRuns: p.team2,
        }));
      }
      if (bc.totalExpectedRuns) {
        totalExpectedRuns = bc.totalExpectedRuns;
      }
    } catch {
      // ignore
    }
  }

  // === 7. 선발 매치업 ===
  const homeStarter = parseStarter(match.homeStarter);
  const awayStarter = parseStarter(match.awayStarter);

  // NPB starter 사진은 외부 fetch
  let homeNpbPhoto: string | undefined;
  let awayNpbPhoto: string | undefined;
  if (league === "NPB") {
    const [hp, ap] = await Promise.all([
      homeStarter?.pid
        ? fetchNpbPhotoUrl(String(homeStarter.pid))
        : Promise.resolve(undefined),
      awayStarter?.pid
        ? fetchNpbPhotoUrl(String(awayStarter.pid))
        : Promise.resolve(undefined),
    ]);
    homeNpbPhoto = hp;
    awayNpbPhoto = ap;
  }

  return (
    <BaseballPreviewInsightTabs
      league={league}
      homeNameKo={homeNameKo}
      awayNameKo={awayNameKo}
      homeLogo={match.homeTeam.logoUrl ?? null}
      awayLogo={match.awayTeam.logoUrl ?? null}
      startTime={match.startTime.toISOString()}
      starters={{ home: homeStarter, away: awayStarter }}
      starterPhotos={{
        home: starterPhoto(league, homeStarter?.pid, homeNpbPhoto ?? null),
        away: starterPhoto(league, awayStarter?.pid, awayNpbPhoto ?? null),
      }}
      starterPlayerHref={{
        home: starterHref(league, homeStarter?.pid),
        away: starterHref(league, awayStarter?.pid),
      }}
      season={{
        home: homeSeason,
        away: awaySeason,
        totalTeams,
      }}
      recent={{
        home: homeRecentRows,
        away: awayRecentRows,
        homePpg: homeTrend.ppg,
        awayPpg: awayTrend.ppg,
        homeAvgFor: homeTrend.avgGoalsFor,
        awayAvgFor: awayTrend.avgGoalsFor,
        homeAvgAgainst: homeTrend.avgGoalsAgainst,
        awayAvgAgainst: awayTrend.avgGoalsAgainst,
      }}
      h2h={{
        total: h2hSummary.total,
        homeWins: h2hSummary.homeTeamWins,
        awayWins: h2hSummary.awayTeamWins,
        draws: h2hSummary.draws,
        recent: h2hRows,
      }}
      aiPredict={{
        elo: { home: homeElo, away: awayElo },
        winProb: { home: winProb.home, away: winProb.away },
        inningProbs,
        totalExpectedRuns,
      }}
    />
  );
}
