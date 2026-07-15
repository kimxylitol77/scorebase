// 발롱도르 지수 후보 데이터 조립 — LeagueLeader(골·도움)+평점+팀성적+월드컵을 선수별 병합.
// 점수 term 을 서버에서 사전계산해 클라(BallonCalculator)가 가중치 배율만 곱해 실시간 재정렬한다.
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { afPlayerToTs } from "@/lib/players/ts-af-map";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { LEAGUE_DISPLAY, getLeagueFlag } from "@/lib/sports/sport-leagues";
import { leagueLogoUrl } from "@/lib/sports/league-logos";
import { isNationalTeamLeague, fifaFlag } from "@/lib/sports/fifa-rankings";

// 리그 계수 — 골 인플레·경쟁력 보정. 키에 든 리그만 후보 대상.
// 빅5=1.0 기준, 챔스/월드컵 상향, 2부·군소 리그 하향.
export const BALLON_LEAGUE_COEF: Record<string, number> = {
  WORLD_CUP: 1.3,
  UCL: 1.2,
  EPL: 1.0,
  LALIGA: 1.0,
  BUNDESLIGA: 1.0,
  SERIE_A: 1.0,
  LIGUE_1: 1.0,
  UEL: 0.8,
  PRIMEIRA_LIGA: 0.7,
  EREDIVISIE: 0.7,
  UECL: 0.65,
  CHAMPIONSHIP: 0.65,
  LIGA_MX: 0.65,
  MLS: 0.62,
  SUPER_LIG: 0.62,
  JUPILER_PL: 0.62,
  SAUDI_PL: 0.6,
  GREEK_SL: 0.55,
  SPL: 0.55,
  LALIGA_2: 0.5,
  BUNDESLIGA_2: 0.5,
  SERIE_B: 0.5,
  LIGUE_2: 0.5,
  A_LEAGUE: 0.5,
  AFC_CL_TWO: 0.55,
};

// 점수 계수 (term 사전계산에 곱하는 고정 상수). 슬라이더는 이 위에 배율(0~2)만 얹는다.
const GOAL_W = 4;
const ASSIST_W = 3;
const RATING_W = 8; // (평균평점 - 6.5) × RATING_W
const RATING_BASE = 6.5;
const TEAM_W = 10; // 팀 순위 정규화(0~1) × TEAM_W

// PlayerMatchLog 심사 창 경계 — 2025-26 시즌 + 2026 월드컵(6-7월).
// 상한을 2026-27 개막(8월) 직전에 둬 새 시즌 경기가 평점 평균에 섞이지 않게 한다.
const SEASON_START = new Date("2025-07-01T00:00:00Z");
const SEASON_END = new Date("2026-08-01T00:00:00Z");

// 2026 발롱도르 심사 창 = 2025-26 유럽 시즌 + 2026 월드컵.
// LeagueLeader 는 리그별로 여러 시즌 라벨을 함께 담을 수 있어(8월 개막 시 2026-27 적재),
// "최신 시즌"을 쓰면 순위가 새 시즌 초반 노이즈로 뒤집힌다. 심사 창 시즌에 고정한다.
const BALLON_AWARD_YEAR = 2026;
const AWARD_EURO_SEASON = `${BALLON_AWARD_YEAR - 1}-${String(BALLON_AWARD_YEAR).slice(2)}`; // "2025-26"
const AWARD_CALENDAR_SEASON = String(BALLON_AWARD_YEAR); // "2026" — 월드컵·MLS 등 달력연도 리그
const CALENDAR_YEAR_LEAGUES = new Set(["WORLD_CUP", "MLS"]);
function awardSeasonLabel(league: string): string {
  return CALENDAR_YEAR_LEAGUES.has(league) ? AWARD_CALENDAR_SEASON : AWARD_EURO_SEASON;
}

export interface BallonLeagueStat {
  code: string;
  label: string;
  flag: string;
  logoUrl: string | null; // 리그 마크 (없으면 flag 폴백)
  goals: number;
  assists: number;
  coef: number;
  isWorldCup: boolean;
}

export interface BallonCandidate {
  afId: string;
  tsId: string | null;
  name: string;
  nameEn: string;
  photoUrl: string | null;
  teamName: string;
  mainLeague: string;
  mainLeagueLabel: string;
  mainLeagueFlag: string;
  mainTeamLogoUrl: string | null; // 클럽 팀 마크 (국가대표면 null)
  mainIsNational: boolean;
  mainFlag: string; // 국가대표 국기 (클럽이면 "")
  leagues: BallonLeagueStat[];
  totalGoals: number;
  totalAssists: number;
  ratingAvg: number | null;
  teamRankPos: number | null;
  teamRankTotal: number | null;
  // 클라 실시간 계산용 사전계산 term
  baseGoalPts: number;
  baseAssistPts: number;
  wcGoalPts: number;
  wcAssistPts: number;
  ratingPts: number;
  teamPts: number;
  href: string | null;
}

// 팀명 매칭용 정규화. LeagueLeader.teamName 은 이미 한글(레알 마드리드)이라 한글을 보존해야
// standings 팀명(영문 → toKoreanTeamName 변환)과 매칭된다.
function normTeam(s: string): string {
  return s
    .normalize("NFC") // NFD 는 한글을 자모로 분해해 가-힣 매칭이 깨진다.
    .toLowerCase()
    .replace(/\b(fc|cf|ac|afc|sc|cd|rcd|sv|ss|ssc|nk|hsv|fk|club)\b/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

interface RawAgg {
  afId: string;
  photoUrl: string | null;
  nameEn: string;
  // league code → { goals, assists, teamName }
  byLeague: Map<string, { goals: number; assists: number; teamName: string }>;
}

/**
 * 발롱도르 지수 후보 배열을 조립한다. 기본 지수(모든 배율 1) 내림차순 상위 limit 명.
 */
export async function buildBallonCandidates(limit = 40): Promise<BallonCandidate[]> {
  const leagues = Object.keys(BALLON_LEAGUE_COEF);

  // 1) 후보 리그의 골·도움 리더 전량 로드 후 리그별 최신 시즌만 필터.
  const rows = await prisma.leagueLeader.findMany({
    where: { league: { in: leagues }, category: { in: ["GOAL", "ASSIST"] } },
    orderBy: [{ season: "desc" }],
    select: {
      league: true, category: true, value: true, playerName: true,
      playerNameEn: true, externalId: true, teamName: true, photoUrl: true, season: true,
    },
  });
  // 리그별 사용 시즌 = 심사 창 시즌 우선, 없으면 최신(전환기 graceful).
  const seasonsByLeague = new Map<string, Set<string>>();
  for (const r of rows) {
    let s = seasonsByLeague.get(r.league);
    if (!s) { s = new Set(); seasonsByLeague.set(r.league, s); }
    s.add(r.season);
  }
  const useSeason = new Map<string, string>();
  for (const [lg, seasons] of seasonsByLeague) {
    const target = awardSeasonLabel(lg);
    useSeason.set(lg, seasons.has(target) ? target : [...seasons].sort().reverse()[0]);
  }

  // 2) af id 로 선수 병합.
  const agg = new Map<string, RawAgg>();
  for (const r of rows) {
    if (!r.externalId) continue;
    if (r.season !== useSeason.get(r.league)) continue;
    const a = agg.get(r.externalId) ?? {
      afId: r.externalId,
      photoUrl: r.photoUrl,
      nameEn: r.playerNameEn ?? r.playerName,
      byLeague: new Map(),
    };
    if (!a.photoUrl && r.photoUrl) a.photoUrl = r.photoUrl;
    const lg = a.byLeague.get(r.league) ?? { goals: 0, assists: 0, teamName: r.teamName };
    if (r.category === "GOAL") lg.goals = r.value;
    else lg.assists = r.value;
    lg.teamName = r.teamName;
    a.byLeague.set(r.league, lg);
    agg.set(r.externalId, a);
  }

  // 3) 평점 배치 조회 (af→ts→PlayerMatchLog 시즌 평균).
  const tsByAf = new Map<string, string>();
  for (const afId of agg.keys()) {
    const ts = afPlayerToTs(afId);
    if (ts) tsByAf.set(afId, ts);
  }
  const ratingByTs = new Map<string, number>();
  if (tsByAf.size > 0) {
    const grouped = await prisma.playerMatchLog.groupBy({
      by: ["playerId"],
      where: {
        playerId: { in: [...new Set(tsByAf.values())] },
        date: { gte: SEASON_START, lt: SEASON_END },
        rating: { not: null },
      },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const g of grouped) {
      // 표본 3경기+ 만 신뢰 (한 경기 고득점 왜곡 방지).
      if ((g._count._all ?? 0) >= 3 && g._avg.rating != null) ratingByTs.set(g.playerId, g._avg.rating);
    }
  }

  // 4) 팀 순위 배치 조회 (후보가 실제 뜬 리그만). 리그 → normTeam → {pos, total}.
  const usedLeagues = new Set<string>();
  for (const a of agg.values()) for (const lg of a.byLeague.keys()) usedLeagues.add(lg);
  usedLeagues.delete("WORLD_CUP"); // WC 는 리그 순위 없음
  const standingsByLeague = new Map<string, Map<string, { pos: number; total: number }>>();
  await Promise.all(
    [...usedLeagues].map(async (lg) => {
      try {
        const rowsS = await getFullStandings(lg);
        if (rowsS.length === 0) return;
        const teamIds = rowsS.map((r) => r.teamId);
        const teams = await prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: { id: true, name: true },
        });
        const nameById = new Map(teams.map((t) => [t.id, t.name]));
        const m = new Map<string, { pos: number; total: number }>();
        for (const r of rowsS) {
          const nm = nameById.get(r.teamId);
          // standings 는 영문 팀명 → 후보(한글)와 맞추려 한글 변환 후 정규화.
          if (nm) m.set(normTeam(toKoreanTeamName(nm, lg)), { pos: r.position, total: rowsS.length });
        }
        standingsByLeague.set(lg, m);
      } catch {
        // standings 없는 리그(녹아웃·그룹) — 팀성적 0 기여로 둠.
      }
    }),
  );

  // 4b) 팀 로고 조회 — LeagueLeader 는 팀명(한글)만 있어 이름 매칭으로 Team.logoUrl 을 붙인다.
  // 컵(UCL 등) 주리그 선수의 클럽은 국내리그 Team row 에 있어 리그 무관 전역 이름 맵으로 해석.
  const allTeams = await prisma.team.findMany({
    where: { league: { in: leagues } },
    select: { name: true, logoUrl: true, league: true },
  });
  const logoByName = new Map<string, string>();
  for (const t of allTeams) {
    if (!t.logoUrl) continue;
    const key = normTeam(toKoreanTeamName(t.name, t.league));
    if (key && !logoByName.has(key)) logoByName.set(key, t.logoUrl);
  }

  // 5) 후보별 term 계산.
  const candidates: BallonCandidate[] = [];
  for (const a of agg.values()) {
    const leagueStats: BallonLeagueStat[] = [];
    let totalGoals = 0;
    let totalAssists = 0;
    let baseGoalPts = 0;
    let baseAssistPts = 0;
    let wcGoalPts = 0;
    let wcAssistPts = 0;
    // 표시·팀성적 기준이 될 주 리그 = 최고 계수 (동률이면 골 많은 쪽).
    let mainLeague = "";
    let mainCoef = -1;
    let mainGoals = -1;
    let mainTeamName = "";

    for (const [code, s] of a.byLeague) {
      const coef = BALLON_LEAGUE_COEF[code] ?? 0.5;
      const isWC = code === "WORLD_CUP";
      totalGoals += s.goals;
      totalAssists += s.assists;
      const gPts = s.goals * GOAL_W * coef;
      const aPts = s.assists * ASSIST_W * coef;
      if (isWC) {
        wcGoalPts += gPts;
        wcAssistPts += aPts;
      } else {
        baseGoalPts += gPts;
        baseAssistPts += aPts;
      }
      leagueStats.push({
        code,
        label: LEAGUE_DISPLAY[code] ?? code,
        flag: getLeagueFlag(code),
        logoUrl: leagueLogoUrl(code),
        goals: s.goals,
        assists: s.assists,
        coef,
        isWorldCup: isWC,
      });
      if (coef > mainCoef || (coef === mainCoef && s.goals > mainGoals)) {
        mainCoef = coef;
        mainGoals = s.goals;
        mainLeague = code;
        mainTeamName = s.teamName;
      }
    }
    leagueStats.sort((x, y) => y.coef - x.coef || y.goals - x.goals);

    // 팀 마크 — 클럽은 로고, 국가대표(월드컵)는 국기.
    const mainIsNational = isNationalTeamLeague(mainLeague);
    const mainTeamLogoUrl = mainIsNational
      ? null
      : (logoByName.get(normTeam(mainTeamName)) ?? null);
    const mainFlag = mainIsNational ? fifaFlag(mainTeamName, mainTeamName) : "";

    // 평점 term
    const ts = tsByAf.get(a.afId) ?? null;
    const ratingAvg = ts ? (ratingByTs.get(ts) ?? null) : null;
    const ratingPts = ratingAvg != null ? Math.max(0, (ratingAvg - RATING_BASE) * RATING_W) : 0;

    // 팀성적 term
    let teamRankPos: number | null = null;
    let teamRankTotal: number | null = null;
    let teamPts = 0;
    const stMap = standingsByLeague.get(mainLeague);
    if (stMap) {
      const hit = stMap.get(normTeam(mainTeamName));
      if (hit) {
        teamRankPos = hit.pos;
        teamRankTotal = hit.total;
        teamPts = ((hit.total - hit.pos + 1) / hit.total) * TEAM_W;
      }
    }

    candidates.push({
      afId: a.afId,
      tsId: ts,
      name: toKoreanPlayerName(a.nameEn),
      nameEn: a.nameEn,
      photoUrl: a.photoUrl,
      teamName: toKoreanTeamName(mainTeamName, mainLeague),
      mainLeague,
      mainLeagueLabel: LEAGUE_DISPLAY[mainLeague] ?? mainLeague,
      mainLeagueFlag: getLeagueFlag(mainLeague),
      mainTeamLogoUrl,
      mainIsNational,
      mainFlag,
      leagues: leagueStats,
      totalGoals,
      totalAssists,
      ratingAvg,
      teamRankPos,
      teamRankTotal,
      baseGoalPts,
      baseAssistPts,
      wcGoalPts,
      wcAssistPts,
      ratingPts,
      teamPts,
      href: ts ? `/transfers/${ts}` : null,
    });
  }

  // 6) 기본 지수(모든 배율 1) 내림차순 상위 limit.
  const score = (c: BallonCandidate) =>
    c.baseGoalPts + c.baseAssistPts + c.wcGoalPts + c.wcAssistPts + c.ratingPts + c.teamPts;
  candidates.sort((a, b) => score(b) - score(a));
  return candidates.slice(0, limit);
}
