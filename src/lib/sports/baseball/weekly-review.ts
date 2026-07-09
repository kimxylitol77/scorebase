// KBO/NPB/MLB 주간 리그 리뷰 ANALYSIS 의 결정론적 데이터 빌더.
// 순위(승률·게임차)·이번 주 경기 결과·팀 타격/투구 지표 리더·연승 팀을 우리 DB 로만 구성.
// 소스: BaseballTeamSeasonStats(팀 시즌 성적) + Match(이번 주 결과). TheSports 직접 호출 없음 → Vercel 안전.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";

export interface WeeklyStanding {
  rank: number;
  team: string; // 짧은 한글 팀명 (season stats 기준)
  games: number; // 소화 경기수 (승+패+무)
  wins: number;
  losses: number;
  draws: number;
  pct: number; // 승률 0~1
  gb: number; // 1위 대비 게임차 (0 = 공동 선두)
  avg: number | null; // 팀 타율
  era: number | null; // 평균자책점
  homeRuns: number | null;
  weekW: number; // 이번 주 승
  weekL: number; // 이번 주 패
  streak: string; // "3연승" | "2연패" | "" (진행 중인 연속 기록만)
}

export interface WeeklyLeader {
  team: string;
  value: number;
}

export interface BaseballWeeklyReviewData {
  league: string;
  season: string;
  weekLabelKo: string; // "7월 3일~7월 9일"
  standings: WeeklyStanding[];
  gamesThisWeek: number;
  leaders: {
    avg: WeeklyLeader[]; // 팀 타율 상위 3
    homeRuns: WeeklyLeader[]; // 팀 홈런 상위 3
    era: WeeklyLeader[]; // 평균자책점 낮은 순 상위 3
  };
  notableResults: string[]; // 이번 주 인상적 결과 ("삼성 6-4 SSG (7/8)")
}

interface WeekGame {
  dateKo: string;
  away: string; // 짧은 팀명(매칭 후) 또는 원본 한글
  home: string;
  awayScore: number;
  homeScore: number;
  margin: number; // 점수차 절댓값
  startMs: number;
}

/** season stats 짧은 팀명 목록에서 Match 한글 팀명(풀네임)에 대응하는 canonical 을 찾는다. */
function makeCanonicalizer(shortNames: string[]) {
  return (fullKo: string): string => {
    // "LG 트윈스" ⊃ "LG" 처럼 짧은명이 풀네임에 포함되면 매칭. 없으면 원본 유지.
    const hit = shortNames.find((s) => fullKo === s || fullKo.includes(s));
    return hit ?? fullKo;
  };
}

/** 팀별 경기 결과 시퀀스(시간순)에서 마지막 연속 기록을 "N연승"/"N연패"로. */
function computeStreak(results: ("W" | "L")[]): string {
  if (results.length === 0) return "";
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  if (n < 2) return "";
  return `${n}${last === "W" ? "연승" : "연패"}`;
}

/**
 * 지정 리그의 주간 리뷰 데이터. refDate(기본 now) 기준 최근 7일을 "이번 주"로 본다.
 * 팀 시즌 스탯이 없으면(스크랩 실패) null.
 */
export async function buildBaseballWeeklyReview(
  league: string,
  refDate: Date = new Date(),
): Promise<BaseballWeeklyReviewData | null> {
  const season = String(refDate.getFullYear());
  const teams = await prisma.baseballTeamSeasonStats.findMany({
    where: { league, season },
    select: {
      teamName: true,
      wins: true,
      losses: true,
      draws: true,
      avg: true,
      era: true,
      homeRuns: true,
    },
  });
  if (teams.length < 4) return null;

  // 승률 정렬 + 게임차
  const ranked = teams
    .map((t) => ({ ...t, pct: t.wins + t.losses > 0 ? t.wins / (t.wins + t.losses) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const leader = ranked[0];

  const shortNames = teams.map((t) => t.teamName);
  const canon = makeCanonicalizer(shortNames);

  // 이번 주(최근 7일) 완료 경기
  const since = new Date(refDate.getTime() - 7 * 86400000);
  const rawGames = await prisma.match.findMany({
    where: { league, status: "FINISHED", startTime: { gte: since, lte: refDate } },
    select: {
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
  });
  const games: WeekGame[] = rawGames
    .filter((g) => g.homeScore != null && g.awayScore != null)
    .map((g) => {
      const kst = new Date(g.startTime.getTime() + 9 * 3600000);
      return {
        dateKo: `${kst.getUTCMonth() + 1}/${kst.getUTCDate()}`,
        away: canon(toKoreanTeamName(g.awayTeam.name, league)),
        home: canon(toKoreanTeamName(g.homeTeam.name, league)),
        awayScore: g.awayScore!,
        homeScore: g.homeScore!,
        margin: Math.abs(g.homeScore! - g.awayScore!),
        startMs: g.startTime.getTime(),
      };
    });

  // 팀별 이번 주 전적 + 연속 기록 (streak 은 이번 주 범위 내 결과 순서 기준)
  const weekW = new Map<string, number>();
  const weekL = new Map<string, number>();
  const seq = new Map<string, ("W" | "L")[]>();
  const push = (team: string, r: "W" | "L") => {
    (r === "W" ? weekW : weekL).set(team, ((r === "W" ? weekW : weekL).get(team) ?? 0) + 1);
    const arr = seq.get(team) ?? [];
    arr.push(r);
    seq.set(team, arr);
  };
  for (const g of games) {
    if (g.homeScore === g.awayScore) continue; // 무승부는 연속기록 제외
    const homeWon = g.homeScore > g.awayScore;
    push(g.home, homeWon ? "W" : "L");
    push(g.away, homeWon ? "L" : "W");
  }

  const standings: WeeklyStanding[] = ranked.map((t, i) => ({
    rank: i + 1,
    team: t.teamName,
    games: t.wins + t.losses + t.draws,
    wins: t.wins,
    losses: t.losses,
    draws: t.draws,
    pct: t.pct,
    gb: (leader.wins - t.wins + (t.losses - leader.losses)) / 2,
    avg: t.avg,
    era: t.era,
    homeRuns: t.homeRuns,
    weekW: weekW.get(t.teamName) ?? 0,
    weekL: weekL.get(t.teamName) ?? 0,
    streak: computeStreak(seq.get(t.teamName) ?? []),
  }));

  // 팀 지표 리더 (상위 3)
  const topBy = <T>(sel: (s: WeeklyStanding) => number | null, desc: boolean): WeeklyLeader[] =>
    standings
      .filter((s) => sel(s) != null)
      .sort((a, b) => (desc ? sel(b)! - sel(a)! : sel(a)! - sel(b)!))
      .slice(0, 3)
      .map((s) => ({ team: s.team, value: sel(s)! }));

  // 이번 주 인상적 결과 — 점수차 큰 경기 상위 4 (최신 우선 tie-break)
  const notableResults = [...games]
    .sort((a, b) => b.margin - a.margin || b.startMs - a.startMs)
    .slice(0, 4)
    .map((g) => `${g.away} ${g.awayScore}-${g.homeScore} ${g.home} (${g.dateKo})`);

  const from = new Date(since.getTime() + 9 * 3600000);
  const to = new Date(refDate.getTime() + 9 * 3600000);
  const weekLabelKo = `${from.getUTCMonth() + 1}월 ${from.getUTCDate()}일~${to.getUTCMonth() + 1}월 ${to.getUTCDate()}일`;

  return {
    league,
    season,
    weekLabelKo,
    standings,
    gamesThisWeek: games.length,
    leaders: {
      avg: topBy((s) => s.avg, true),
      homeRuns: topBy((s) => s.homeRuns, true),
      era: topBy((s) => s.era, false),
    },
    notableResults,
  };
}
