// 컵 대회에서 두 팀이 홈·원정을 바꿔 치른 직전 맞대결 + 두 경기 합계.
//
// 7m 은 이걸 "1.2차전[1-1]" 로 단정해 보여주지만, 우리 DB 에는 녹아웃 단계를 확정할
// 정보가 없다 — 축구 Match 에 라운드 필드가 없고 af 라운드는 컵 fixture 매칭률이
// FA컵 0%·코파 리베르타도레스 31% 로 반쪽이다. 조별리그 홈&원정을 2차전으로 오판할
// 수 있어 "1·2차전" 이라는 말은 쓰지 않고 "직전 맞대결" 로만 부른다.
// 합계 자체는 어느 쪽이든 사실이라 그대로 보여준다.

import { prisma } from "@/lib/db";
import { parseTsFootballScore } from "@/lib/sports/live-scores";

/** 두 팀이 홈·원정을 바꿔 두 번 붙는 대회 — 이 밖에서는 "합계" 가 의미를 갖지 않는다. */
const CUP_LEAGUES = new Set<string>([
  "UCL", "UEL", "UECL", "UEFA_WCL",
  "AFC_CL", "AFC_CL_TWO", "AFC_CUP", "CONCACAF_CCUP",
  "COPA_LIB", "COPA_SUD", "CANADA_CHAMP",
  "FA_CUP", "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA",
  "DFB_POKAL", "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "LEVAIN_CUP",
  "SUI_CUP", "SVENSKA_CUPEN", "COPA_DO_BRASIL",
]);

/**
 * 직전 맞대결로 인정하는 최대 간격.
 * 녹아웃 1·2차전은 보통 7~14일이다. 창을 넓히면 같은 시즌 조별리그 경기까지
 * 끌려온다 (실측: 코파 리베르타도레스 같은 대진이 4월 조별 · 8월 녹아웃 두 번).
 */
const MAX_DAYS = 21;

export interface PreviousLeg {
  playedAt: Date;
  /** 직전 경기 스코어 — 현재 경기의 홈팀 기준 (연장 포함, 승부차기 제외) */
  homeGoals: number;
  awayGoals: number;
  /** 두 경기 합계 — 현재 경기의 홈팀 기준 */
  aggHome: number;
  aggAway: number;
  daysBetween: number;
}

/**
 * 컵 대회에서 홈·원정을 바꿔 치른 직전 맞대결. 없으면 null.
 * thisHome/thisAway 는 현재 경기의 연장 포함 스코어(승부차기 제외)를 넘긴다.
 */
export async function getPreviousLeg(args: {
  matchId: number;
  league: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  thisHome: number;
  thisAway: number;
}): Promise<PreviousLeg | null> {
  if (!CUP_LEAGUES.has(args.league)) return null;

  const since = new Date(args.startTime.getTime() - MAX_DAYS * 24 * 60 * 60 * 1000);
  const prev = await prisma.match.findFirst({
    where: {
      league: args.league,
      status: "FINISHED",
      id: { not: args.matchId },
      // 홈·원정이 뒤바뀐 경기만 — 같은 순서면 재경기라 합계 대상이 아니다.
      homeTeamId: args.awayTeamId,
      awayTeamId: args.homeTeamId,
      homeScore: { not: null },
      awayScore: { not: null },
      startTime: { gte: since, lt: args.startTime },
    },
    orderBy: { startTime: "desc" },
    include: { theSportsCache: true },
  });
  if (!prev) return null;

  // DB 점수는 승부차기가 합산돼 굳었을 수 있다(scores/page.tsx 의 UCL 결승 4-3 사례).
  // ts 캐시가 있으면 연장 포함 main 점수를 쓰고, 없을 때만 DB 값으로 떨어진다.
  const parsed = parseTsFootballScore(prev.theSportsCache?.detailLive);
  // prev 는 홈·원정이 뒤바뀐 경기 — 현재 홈팀 기준으로 뒤집어 담는다.
  const homeGoals = parsed ? parsed.mainAway : (prev.awayScore as number);
  const awayGoals = parsed ? parsed.mainHome : (prev.homeScore as number);

  return {
    playedAt: prev.startTime,
    homeGoals,
    awayGoals,
    aggHome: homeGoals + args.thisHome,
    aggAway: awayGoals + args.thisAway,
    daysBetween: Math.round(
      (args.startTime.getTime() - prev.startTime.getTime()) / (24 * 60 * 60 * 1000),
    ),
  };
}
