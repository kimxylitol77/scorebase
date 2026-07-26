// /en 시즌 시뮬 헬퍼 — ko /predictions/[league] 와 동일 파이프라인(시즌 창 로드 → runMonteCarlo 5,000회)의
// 린 버전. 단일 순위표 시뮬이 의미 있는 리그만 지원 (UCL 브래킷·NBA/NHL 플레이오프 포맷 제외).
// "1st place" = 통합 테이블 1위 확률 — 다중 리그 야구(MLB·NPB)에서도 사실 그대로인 표현.
import { prisma } from "@/lib/db";
import { runMonteCarlo } from "@/lib/predict/monte-carlo";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import type { PredictMatch } from "@/lib/predict/types";
import { toEnglishTeamName } from "@/lib/i18n/en";

interface SimConfig {
  relegationCount: number;
  /** 플레이오프 컬럼 — 리그별 의미 있는 top 컷만 노출 */
  playoff?: { key: "top4" | "top5"; label: string };
  /** 야구는 승점 개념이 없어 xPts 컬럼 숨김 */
  hideXPts?: boolean;
}

// relegationCount 는 ko LEAGUE_INFO 와 동일 값 유지 (두 언어 시뮬 전제 일치)
export const EN_SIM_LEAGUES: Record<string, SimConfig> = {
  EPL: { relegationCount: 3, playoff: { key: "top4", label: "Top 4" } },
  LALIGA: { relegationCount: 3, playoff: { key: "top4", label: "Top 4" } },
  BUNDESLIGA: { relegationCount: 3, playoff: { key: "top4", label: "Top 4" } },
  SERIE_A: { relegationCount: 3, playoff: { key: "top4", label: "Top 4" } },
  LIGUE_1: { relegationCount: 2, playoff: { key: "top4", label: "Top 4" } },
  MLS: { relegationCount: 0 },
  K_LEAGUE_1: { relegationCount: 1, playoff: { key: "top4", label: "Top 4" } },
  KBO: { relegationCount: 0, playoff: { key: "top5", label: "Postseason (Top 5)" }, hideXPts: true },
  NPB: { relegationCount: 0, hideXPts: true },
  MLB: { relegationCount: 0, hideXPts: true },
};

export interface EnSimRow {
  team: string;
  currentPosition: number;
  champion: number;
  playoff: number | null;
  relegation: number | null;
  expectedPoints: number;
}

export interface EnSimResult {
  rows: EnSimRow[];
  finishedCount: number;
  scheduledCount: number;
  config: SimConfig;
}

/** 남은 일정이 있는 시즌만 시뮬 반환 — 종료 시즌 재시뮬(무의미)·표본 부족은 null. */
export async function runEnSeasonSim(league: string): Promise<EnSimResult | null> {
  const config = EN_SIM_LEAGUES[league];
  if (!config) return null;

  const matchSelect = {
    id: true,
    league: true,
    status: true,
    homeTeamId: true,
    awayTeamId: true,
    homeScore: true,
    awayScore: true,
    startTime: true,
  } as const;
  const seasonStart = currentSeasonStart(league);
  let dbMatches = await prisma.match.findMany({
    where: { league, ...(seasonStart ? { startTime: { gte: seasonStart } } : {}) },
    select: matchSelect,
  });
  if (seasonStart && dbMatches.filter((m) => m.status === "FINISHED").length < 10) {
    dbMatches = await prisma.match.findMany({
      where: {
        league,
        startTime: { gte: previousSeasonStart(seasonStart), lt: seasonStart },
      },
      select: matchSelect,
    });
  }
  const matches: PredictMatch[] = dbMatches.map((m) => ({ ...m }));
  const finishedCount = matches.filter((m) => m.status === "FINISHED").length;
  const scheduledCount = matches.filter((m) => m.status === "SCHEDULED").length;
  if (finishedCount < 20 || scheduledCount < 1) return null;

  const mc = runMonteCarlo(matches, league, {
    iterations: 5000,
    relegationCount: config.relegationCount,
  });
  if (mc.length === 0) return null;

  const teams = await prisma.team.findMany({
    where: { id: { in: mc.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, toEnglishTeamName(t.name)]));

  const rows: EnSimRow[] = mc
    .slice()
    .sort((a, b) => b.champion - a.champion || a.expectedPosition - b.expectedPosition)
    .map((r) => ({
      team: nameById.get(r.teamId) ?? `Team ${r.teamId}`,
      currentPosition: r.currentPosition,
      champion: r.champion,
      playoff: config.playoff ? r[config.playoff.key] : null,
      relegation: config.relegationCount > 0 ? r.relegation : null,
      expectedPoints: r.expectedPoints,
    }));

  return { rows, finishedCount, scheduledCount, config };
}
