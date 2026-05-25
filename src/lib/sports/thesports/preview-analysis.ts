// TheSports /v1/football/match/analysis 응답 파서.
// PREVIEW 글 생성 잡이 prompt context 보강용으로 사용.
//
// 응답 구조 (검증):
//   results.info: [matchId, competitionId, statusId, time, _, home_stats, away_stats, odds, misc, [seasonId, year]]
//   results.history.vs:   두 팀 간 H2H (모든 대회 포함, 최신순)
//   results.history.home: home 팀의 최근 30경기 (모든 대회)
//   results.history.away: away 팀의 최근 30경기 (모든 대회)
//   results.future.home / .away: 향후 경기 일정
//   results.goal_distribution: { home: {all,home,away}, away: {all,home,away} } — 시간대별 골 분포
//
// 각 match record (array):
//   [0] matchId, [1] competitionId, [2] status_id, [3] match_time(unix),
//   [4] _, [5] home_stats, [6] away_stats, [7] odds, [8] misc, [9] [seasonId, year]
//
// home_stats / away_stats array:
//   [0] tsTeamId, [1] resultCode, [2] ftGoals, [3] htGoals, [4..] 기타 stats (미사용)

interface MatchRecord {
  date: string;
  homeTsId: string;
  awayTsId: string;
  homeScore: number;
  awayScore: number;
  season?: string;
}

export interface OurH2HMatch {
  date: string;
  /** 그 경기에서 우리 home 팀이 home 으로 출전했나? false 면 우리 home 이 원정. */
  ourHomeWasHome: boolean;
  ourHomeScore: number;
  ourAwayScore: number;
  result: "W" | "D" | "L";
  season?: string;
}

export interface OurTeamRecentMatch {
  date: string;
  wasHome: boolean;
  teamScore: number;
  opponentScore: number;
  result: "W" | "D" | "L";
  season?: string;
}

export interface TsGoalBuckets {
  /** 6 buckets: 1-15, 16-30, 31-45, 46-60, 61-75, 76-90 — 시즌 누적 골수 */
  scored: number[];
  conceded: number[];
  matches: number;
}

export interface ParsedTsAnalysis {
  h2h: OurH2HMatch[];
  homeRecent: OurTeamRecentMatch[];
  awayRecent: OurTeamRecentMatch[];
  goalBuckets?: {
    home: TsGoalBuckets;
    away: TsGoalBuckets;
  };
}

function toIsoDate(unix: number): string {
  if (!unix || typeof unix !== "number") return "";
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

function parseMatchRecord(rec: unknown): MatchRecord | null {
  if (!Array.isArray(rec) || rec.length < 10) return null;
  const homeStats = rec[5];
  const awayStats = rec[6];
  if (!Array.isArray(homeStats) || !Array.isArray(awayStats)) return null;
  const homeTsId = homeStats[0];
  const awayTsId = awayStats[0];
  if (typeof homeTsId !== "string" || typeof awayTsId !== "string") return null;
  const homeScore = typeof homeStats[2] === "number" ? homeStats[2] : null;
  const awayScore = typeof awayStats[2] === "number" ? awayStats[2] : null;
  if (homeScore == null || awayScore == null) return null;
  const time = typeof rec[3] === "number" ? rec[3] : 0;
  const seasonArr = rec[9];
  const season =
    Array.isArray(seasonArr) && typeof seasonArr[1] === "string"
      ? seasonArr[1]
      : undefined;
  return { date: toIsoDate(time), homeTsId, awayTsId, homeScore, awayScore, season };
}

function classifyResult(myScore: number, oppScore: number): "W" | "D" | "L" {
  if (myScore > oppScore) return "W";
  if (myScore < oppScore) return "L";
  return "D";
}

/**
 * TheSports analysis JSON 을 우리 home/away 팀 관점으로 정규화.
 * ourHomeTsId / ourAwayTsId 는 우리 매치 양 팀의 TheSports id
 * (team-id-mapping.json 으로 lookup).
 */
export function parseTsAnalysisForPreview(
  analysis: unknown,
  ourHomeTsId: string,
  ourAwayTsId: string,
  limit = 7,
): ParsedTsAnalysis | null {
  if (!analysis || typeof analysis !== "object") return null;
  const root = analysis as Record<string, unknown>;
  const history = (root.history ?? {}) as Record<string, unknown>;

  const vsRaw = Array.isArray(history.vs) ? history.vs : [];
  const homeRaw = Array.isArray(history.home) ? history.home : [];
  const awayRaw = Array.isArray(history.away) ? history.away : [];

  const h2h: OurH2HMatch[] = [];
  for (const rec of vsRaw) {
    const m = parseMatchRecord(rec);
    if (!m) continue;
    const ourHomeWasHome =
      m.homeTsId === ourHomeTsId && m.awayTsId === ourAwayTsId;
    const ourHomeWasAway =
      m.homeTsId === ourAwayTsId && m.awayTsId === ourHomeTsId;
    if (!ourHomeWasHome && !ourHomeWasAway) continue;
    const ourHomeScore = ourHomeWasHome ? m.homeScore : m.awayScore;
    const ourAwayScore = ourHomeWasHome ? m.awayScore : m.homeScore;
    h2h.push({
      date: m.date,
      ourHomeWasHome,
      ourHomeScore,
      ourAwayScore,
      result: classifyResult(ourHomeScore, ourAwayScore),
      season: m.season,
    });
    if (h2h.length >= limit) break;
  }

  const parseTeamRecent = (
    raw: unknown[],
    teamTsId: string,
  ): OurTeamRecentMatch[] => {
    const out: OurTeamRecentMatch[] = [];
    for (const rec of raw) {
      const m = parseMatchRecord(rec);
      if (!m) continue;
      const wasHome = m.homeTsId === teamTsId;
      const wasAway = m.awayTsId === teamTsId;
      if (!wasHome && !wasAway) continue;
      const teamScore = wasHome ? m.homeScore : m.awayScore;
      const opponentScore = wasHome ? m.awayScore : m.homeScore;
      out.push({
        date: m.date,
        wasHome,
        teamScore,
        opponentScore,
        result: classifyResult(teamScore, opponentScore),
        season: m.season,
      });
      if (out.length >= limit) break;
    }
    return out;
  };

  const homeRecent = parseTeamRecent(homeRaw, ourHomeTsId);
  const awayRecent = parseTeamRecent(awayRaw, ourAwayTsId);

  // goal_distribution: { home: { all: { matches, scored: [[goals, percent, fromMin, toMin], ...], conceded: ... }, ... }, away: {...} }
  let goalBuckets: ParsedTsAnalysis["goalBuckets"] | undefined;
  const gd = root.goal_distribution as Record<string, unknown> | undefined;
  if (gd) {
    const pickBuckets = (side: string): TsGoalBuckets | null => {
      const teamGd = gd[side] as Record<string, unknown> | undefined;
      const all = teamGd?.all as Record<string, unknown> | undefined;
      if (!all) return null;
      const matches = typeof all.matches === "number" ? all.matches : 0;
      const extract = (arr: unknown): number[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map((b) =>
          Array.isArray(b) && typeof b[0] === "number" ? b[0] : 0,
        );
      };
      const scored = extract(all.scored);
      const conceded = extract(all.conceded);
      if (scored.length === 0 && conceded.length === 0) return null;
      return { matches, scored, conceded };
    };
    const homeBk = pickBuckets("home");
    const awayBk = pickBuckets("away");
    if (homeBk && awayBk) goalBuckets = { home: homeBk, away: awayBk };
  }

  if (
    h2h.length === 0 &&
    homeRecent.length === 0 &&
    awayRecent.length === 0 &&
    !goalBuckets
  ) {
    return null;
  }

  return { h2h, homeRecent, awayRecent, goalBuckets };
}
