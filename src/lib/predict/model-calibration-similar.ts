// 우리 모델이 비슷한 확률로 봤던 과거 경기의 실제 결과 분포 — 축구 전용 (3-way).
//
// 7m 의 "역사 전적(같은 핸디캡)" 자리를 우리 재료로 대체한 것. 7m 은 시장 핸디캡
// 라인을 기준으로 팀 단위 20경기를 세는데, 우리 `Match.oddsHcLine` 은 축구가
// 리그당 20~40건뿐이라 그 방식을 못 쓴다. 대신 채점 완료된 예측 스냅샷
// (`predHome`, 3-way 13,000경기+)을 확률대로 묶는다 — 캘리브레이션의 정석 방식이다.
//
// 결정 근거·실측은 docs/match-detail-7m/context-notes.md.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { SPORTS } from "@/lib/sports/sport-leagues";

/**
 * 모집단에서 빼는 축구 대회 — 컵·토너먼트·친선·예선.
 *
 * 이유 1: `Match.homeScore` 는 승부차기 합산으로 오염될 수 있다
 *   (scores/page.tsx 의 "DB.homeScore 는 승부차기 합산 오염 가능" 주석과 같은 사안).
 *   실측에서도 컵 무승부율 19.0% vs 리그 25.2% 로 어긋난다 — 90분 결과 기준이 깨진다.
 * 이유 2: 친선은 결과 자체가 팀 전력을 반영하지 않는다.
 *
 * 대상 경기가 컵이어도 카드는 뜬다 — 기준점은 확률값이라 모집단과 무관하다.
 */
const EXCLUDED_LEAGUES = new Set<string>([
  // 대륙 클럽 대회
  "UCL", "UEL", "UECL", "UEFA_WCL",
  "AFC_CL", "AFC_CL_TWO", "AFC_CUP", "CONCACAF_CCUP",
  "COPA_LIB", "COPA_SUD", "LEAGUES_CUP", "CANADA_CHAMP",
  // 자국 컵 / 슈퍼컵
  "FA_CUP", "EFL_CUP", "SCO_LEAGUE_CUP", "COPA_DEL_REY", "COPPA_ITALIA",
  "DFB_POKAL", "COUPE_DE_FRANCE", "KFA_CUP", "EMPEROR_CUP", "LEVAIN_CUP",
  "SUI_CUP", "SVENSKA_CUPEN", "COPA_DO_BRASIL", "PORTUGAL_SUPER_CUP",
  // 국가대표 토너먼트 / 예선
  "WORLD_CUP", "CLUB_WORLD_CUP", "AFCON", "CONCACAF_GOLD", "UEFA_NL",
  "WC_QUAL", "EURO_QUAL", "UEFA_U21_Q", "UEFA_U21", "UEFA_U19", "UEFA_U17",
  "U20_WC", "U17_WC", "OLYMPICS_FOOTBALL", "AFC_U23", "ASEAN_CHAMP",
  // 친선
  "INTL_FRIENDLY", "CLUB_FRIENDLY",
]);

/** 모집단 = 축구 리그 전체에서 위 제외 목록을 뺀 정규 리그. */
export const CALIBRATION_POOL_LEAGUES: string[] = (
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? []
).filter((code) => !EXCLUDED_LEAGUES.has(code));

/** 축구 매치인지 — 카드 노출 대상 판정용 (대상 경기는 컵이어도 된다). */
export const CALIBRATION_TARGET_LEAGUES = new Set<string>(
  SPORTS.find((s) => s.code === "soccer")?.leagues ?? [],
);

/** 유사 판정 밴드 — 기본 ±0.03, 표본 부족 시 한 번만 ±0.05 로 넓힌다. */
const BAND_NARROW = 0.03;
const BAND_WIDE = 0.05;

/** 이 미만이면 비율을 말할 근거가 부족하다고 보고 카드를 숨긴다. */
const MIN_SAMPLE = 30;

export interface ModelCalibrationStats {
  /** 대상 경기에 대한 모델의 홈 승리 확률 */
  targetHomeProb: number;
  /** 실제 사용된 밴드 (±) */
  band: number;
  sampleSize: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  /** 표본의 모델 평균 홈 승리 확률 — 모델이 본 값 */
  modelAvgHome: number;
  /** 표본의 실제 홈 승리 비율 */
  actualHomeRate: number;
  actualDrawRate: number;
  actualAwayRate: number;
  /** 실제 - 모델 (%p). 양수면 모델이 홈을 과소평가했다는 뜻 */
  gapPoints: number;
}

interface AggRow {
  n: number;
  home_wins: number;
  draws: number;
  away_wins: number;
  model_avg: number | null;
}

/**
 * 대상 경기와 모델 홈 승리 확률이 비슷했던 과거 축구 경기의 결과 분포.
 * 축구가 아니거나 예측이 없거나 표본 미달이면 null.
 */
export async function getModelCalibrationStats(match: {
  id: number;
  league: string;
  predHome: number | null;
  predDraw: number | null;
}): Promise<ModelCalibrationStats | null> {
  if (!CALIBRATION_TARGET_LEAGUES.has(match.league)) return null;

  const target = match.predHome;
  // predDraw 가 있어야 3-way 예측 — 2-way 종목 값이 섞여 들어오는 것을 막는다.
  if (target == null || match.predDraw == null) return null;

  for (const band of [BAND_NARROW, BAND_WIDE]) {
    const rows = await prisma.$queryRaw<AggRow[]>`
      SELECT
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE "homeScore" > "awayScore")::int AS home_wins,
        COUNT(*) FILTER (WHERE "homeScore" = "awayScore")::int AS draws,
        COUNT(*) FILTER (WHERE "homeScore" < "awayScore")::int AS away_wins,
        AVG("predHome")::float8 AS model_avg
      FROM "Match"
      WHERE status = 'FINISHED'
        AND "predHome" IS NOT NULL
        AND "predDraw" IS NOT NULL
        AND "homeScore" IS NOT NULL
        AND "awayScore" IS NOT NULL
        AND id <> ${match.id}
        AND league IN (${Prisma.join(CALIBRATION_POOL_LEAGUES)})
        AND "predHome" BETWEEN ${target - band} AND ${target + band}
    `;

    const r = rows[0];
    if (!r || r.n < MIN_SAMPLE || r.model_avg == null) continue;

    const actualHomeRate = r.home_wins / r.n;
    return {
      targetHomeProb: target,
      band,
      sampleSize: r.n,
      homeWins: r.home_wins,
      draws: r.draws,
      awayWins: r.away_wins,
      modelAvgHome: r.model_avg,
      actualHomeRate,
      actualDrawRate: r.draws / r.n,
      actualAwayRate: r.away_wins / r.n,
      gapPoints: (actualHomeRate - r.model_avg) * 100,
    };
  }

  return null;
}
