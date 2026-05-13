// 야구(KBO/MLB/NPB) PREVIEW/RECAP 컨텍스트 보강.
//
// buildMatchContext 가 채워준 baseballStats(시즌 평균 RPG/RApg) + context.starters
// (양 팀 선발 ERA) + Team.name(홈팀 구장) 을 입력으로 calculateInningScoreProbs 호출.
// 결과를 context.inningScoreProbs / totalExpectedRuns / winProbPoisson 에 부착.
//
// 호출 시점: generate-articles (RECAP) / generate-previews (PREVIEW) 두 잡 모두
// starter 정보 채운 직후.

import type { PreviewContext } from "@/prompts/match-preview";
import { calculateInningScoreProbs } from "./baseball-poisson";
import { getParkFactor } from "./park-factors";

export const BASEBALL_LEAGUES = new Set(["KBO", "MLB", "NPB"]);

interface BaseballMatchLite {
  id: number;
  league: string;
  homeTeam: { name: string };
}

const LEAGUE_BULLPEN_ERA_FALLBACK = 4.2;

export function enrichBaseballContext(
  context: PreviewContext,
  match: BaseballMatchLite,
): PreviewContext {
  if (
    !BASEBALL_LEAGUES.has(match.league) ||
    !context.baseballStats ||
    context.starters?.home?.era == null ||
    context.starters?.away?.era == null
  ) {
    return context;
  }
  try {
    const homeEra = context.starters.home.era as number;
    const awayEra = context.starters.away.era as number;
    // 최근 폼: 최근 5경기 평균 - 시즌 평균. ±0.4 클램프 (이상치 안정화).
    const homeForm = clamp(
      (context.trend?.home.gf ?? context.baseballStats.home.rpg) -
        context.baseballStats.home.rpg,
      -0.4,
      0.4,
    );
    const awayForm = clamp(
      (context.trend?.away.gf ?? context.baseballStats.away.rpg) -
        context.baseballStats.away.rpg,
      -0.4,
      0.4,
    );
    const poisson = calculateInningScoreProbs({
      // team1 = 원정(away), team2 = 홈(home)
      team1AvgRpg: context.baseballStats.away.rpg,
      team1AvgRApg: context.baseballStats.away.rapg,
      team2AvgRpg: context.baseballStats.home.rpg,
      team2AvgRApg: context.baseballStats.home.rapg,
      team1StarterEra: awayEra,
      team2StarterEra: homeEra,
      team1StarterInnings: parseIp(context.starters.away.ip) ?? 5.5,
      team2StarterInnings: parseIp(context.starters.home.ip) ?? 5.5,
      team1BullpenEra: LEAGUE_BULLPEN_ERA_FALLBACK,
      team2BullpenEra: LEAGUE_BULLPEN_ERA_FALLBACK,
      parkFactor: getParkFactor(
        match.league as "KBO" | "NPB" | "MLB",
        match.homeTeam.name,
      ),
      team1RecentForm: awayForm,
      team2RecentForm: homeForm,
    });
    context.inningScoreProbs = poisson.inningProbs;
    context.totalExpectedRuns = poisson.totalExpectedRuns;
    context.winProbPoisson = poisson.winProb;
  } catch (err) {
    console.warn(
      `[baseball-poisson] match #${match.id} 실패:`,
      (err as Error).message,
    );
  }
  return context;
}

/** KBO/NPB raw IP ("38 2/3" or "38.2") → 이닝 소수. */
export function parseIp(ip: string | undefined): number | undefined {
  if (!ip) return undefined;
  const s = ip.trim();
  const frac = s.match(/^(\d+)\s+([12])\/3$/);
  if (frac) return Number(frac[1]) + Number(frac[2]) / 3;
  const dot = s.match(/^(\d+)(?:\.(\d))?$/);
  if (dot) {
    const whole = Number(dot[1]);
    const f = dot[2] ? Number(dot[2]) : 0;
    return whole + f / 3;
  }
  return undefined;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
