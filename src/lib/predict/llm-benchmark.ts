// LLM 예측 벤치마크 집계 — /en/benchmark 와 원본 데이터 내려받기가 공유하는 단일 소스.
//
// 이 벤치마크가 주장하는 건 하나다. 모든 예측은 킥오프 전에 찍혔고, 따라서 모델이
// 정답을 학습했을 수 없다. 그 보증은 scorecard-eligibility.ts 가 담당하고,
// 여기서는 SQL 단에서 같은 조건(predictedAt < startTime)을 직접 건다.
//
// 수치 정의는 영어권 독자가 검증할 것을 전제로 엄격하게 잡는다.
//  - accuracy = 픽이 실제 결과와 일치한 비율. 95% CI 는 정규근사(Wald).
//  - Brier    = 모델이 자기 픽에 붙인 확신도 p 에 대해 correct ? (1-p)² : p².
//               3-way 멀티클래스 Brier 가 아니라 "선택한 픽의 확신도" 점수다.
//  - ECE      = 확신도 구간별 |주장 - 실제| 를 표본수로 가중 평균한 값.

import { prisma } from "@/lib/db";
import { unstable_cache } from "next/cache";

/** 야구는 무승부가 없고 기본 승률이 높아 다른 종목과 섞으면 해석이 왜곡된다. */
const BASEBALL = ["MLB", "NPB", "KBO"];

// 확신도 버킷 — 5%p 폭으로 30%~100% 전체를 덮는다.
// 상한을 0.90 으로 두면 90% 이상 예측이 오버플로 버킷으로 빠지고,
// 그게 표시 하한(n>=40)에 걸려 조용히 사라진다. 하필 가장 과신한 구간이라
// 결과가 실제보다 순해 보인다 — 범위로 덮어서 누락 자체를 없앤다.
const BIN_LO = 0.3;
const BIN_HI = 1.0;
const BIN_COUNT = 14;
/** 표시 하한 — 이보다 작은 버킷은 그리지 않는다(페이지에 명시한다). */
export const MIN_BIN_N = 40;

export interface ModelStat {
  model: string;
  n: number;
  hit: number;
  accuracy: number;
  ci: number;
  brier: number;
  ece: number;
}

export interface CalibrationBin {
  claimed: number;
  actual: number;
  n: number;
  ci: number;
}

export interface SportSplit {
  model: string;
  baseballN: number;
  baseballAcc: number | null;
  otherN: number;
  otherAcc: number | null;
}

export interface PairedTest {
  model: string;
  /** 시장은 맞고 모델은 틀린 경기 수 */
  marketOnly: number;
  /** 모델은 맞고 시장은 틀린 경기 수 */
  modelOnly: number;
  n: number;
  /** McNemar 카이제곱 (연속성 보정) */
  chi2: number;
  /** 근사 p-value */
  p: number;
}

export interface BenchmarkData {
  scored: number;
  matches: number;
  models: number;
  from: string;
  to: string;
  excluded: number;
  calibration: CalibrationBin[];
  /** 표시 하한(n<40)에 걸려 곡선에서 빠진 예측 수 — 페이지에 그대로 밝힌다. */
  calibrationHidden: number;
  /** 캘리브레이션 대상 1X2 LLM 예측 총수 */
  calibrationTotal: number;
  /** 대조군 곡선 — 배당 시장은 대각선에 붙고 LLM 은 아래로 처진다 */
  marketCalibration: CalibrationBin[];
  perModel: ModelStat[];
  market: ModelStat | null;
  sportSplit: SportSplit[];
  paired: PairedTest[];
  leagues: { league: string; n: number }[];
}

function toBin(r: { claimed: number; actual: number; n: bigint }): CalibrationBin {
  const n = Number(r.n), actual = Number(r.actual);
  return { claimed: Number(r.claimed), actual, n, ci: wald(actual * n, n) };
}

/** 95% CI 반폭 (정규근사). */
function wald(hit: number, n: number): number {
  if (n === 0) return 0;
  const p = hit / n;
  return 1.96 * Math.sqrt((p * (1 - p)) / n);
}

/** McNemar 카이제곱 → p-value 근사 (자유도 1, Wilson–Hilferty). */
function chiSqP(chi2: number): number {
  if (chi2 <= 0) return 1;
  // 자유도 1 에서 p = erfc(sqrt(chi2/2))
  const x = Math.sqrt(chi2 / 2);
  // Abramowitz–Stegun 7.1.26 기반 erfc 근사
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return Math.min(1, y * Math.exp(-x * x));
}

/** 캐시 없이 즉시 집계 — 원본 데이터 내보내기·검증 스크립트가 쓴다.
 *  (unstable_cache 는 Next 요청 컨텍스트 밖에서 못 돈다) */
export async function computeBenchmark(): Promise<BenchmarkData> {
  const [scale, excludedRow, calRows, modelRows, marketRow, splitRows, pairedRows, mktCalRows, calTotalRow, leagueRows] =
    await Promise.all([
      prisma.$queryRaw<{ scored: bigint; matches: bigint; models: bigint; d0: string; d1: string }[]>`
        SELECT COUNT(*)::bigint AS scored, COUNT(DISTINCT p."matchId")::bigint AS matches,
               COUNT(DISTINCT p.model)::bigint AS models,
               to_char(MIN(p."predictedAt"), 'YYYY-MM-DD') AS d0,
               to_char(MAX(p."predictedAt"), 'YYYY-MM-DD') AS d1
        FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime"`,

      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" >= m."startTime"`,

      // LLM 만 (통계모델 scorebase 제외) — 확신도 5%p 구간
      prisma.$queryRaw<{ claimed: number; actual: number; n: bigint }[]>`
        SELECT AVG(p.prob) AS claimed, AVG(CASE WHEN p.correct THEN 1.0 ELSE 0.0 END) AS actual,
               COUNT(*)::bigint AS n
        FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime"
          AND p.market = '1X2' AND p.model <> 'scorebase'
        GROUP BY width_bucket(p.prob, ${BIN_LO}::float8, ${BIN_HI}::float8, ${BIN_COUNT}::int)
        HAVING COUNT(*) >= ${MIN_BIN_N}::int
        ORDER BY 1`,

      prisma.$queryRaw<{ model: string; n: bigint; hit: bigint; brier: number; ece: number }[]>`
        WITH b AS (
          SELECT p.model, p.correct, p.prob,
                 width_bucket(p.prob, ${BIN_LO}::float8, ${BIN_HI}::float8, ${BIN_COUNT}::int) AS bin
          FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
          WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime" AND p.market = '1X2'
        ), per_bin AS (
          SELECT model, bin, COUNT(*)::numeric AS bn,
                 ABS(AVG(prob) - AVG(CASE WHEN correct THEN 1.0 ELSE 0.0 END)) AS gap
          FROM b GROUP BY model, bin
        )
        SELECT b.model, COUNT(*)::bigint AS n,
               SUM(CASE WHEN b.correct THEN 1 ELSE 0 END)::bigint AS hit,
               AVG(POWER((CASE WHEN b.correct THEN 1 ELSE 0 END) - b.prob, 2)) AS brier,
               (SELECT SUM(bn * gap) / SUM(bn) FROM per_bin WHERE per_bin.model = b.model) AS ece
        FROM b GROUP BY b.model
        HAVING COUNT(*) >= 200
        ORDER BY n DESC`,

      // 대조군 — 같은 경기 집합에서 배당 시장이 고른 쪽
      prisma.$queryRaw<{ n: bigint; hit: bigint; brier: number; ece: number }[]>`
        WITH mm AS (
          SELECT DISTINCT m.id, m."marketHome" h, m."marketDraw" d, m."marketAway" a,
                 m."homeScore" hs, m."awayScore" aws
          FROM "Match" m
          WHERE m.id IN (
            SELECT p."matchId" FROM "AiPrediction" p JOIN "Match" m2 ON m2.id = p."matchId"
            WHERE p.correct IS NOT NULL AND p.market = '1X2' AND p."predictedAt" < m2."startTime")
            AND m."marketHome" IS NOT NULL AND m."marketAway" IS NOT NULL
            AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
        ), pick AS (
          SELECT GREATEST(h, COALESCE(d, 0), a) AS prob,
                 (CASE WHEN h >= GREATEST(COALESCE(d,0), a) THEN 'HOME'
                       WHEN a >= GREATEST(COALESCE(d,0), h) THEN 'AWAY' ELSE 'DRAW' END)
                 = (CASE WHEN hs > aws THEN 'HOME' WHEN aws > hs THEN 'AWAY' ELSE 'DRAW' END) AS ok
          FROM mm
        ), pb AS (
          SELECT width_bucket(prob, ${BIN_LO}::float8, ${BIN_HI}::float8, ${BIN_COUNT}::int) AS bin, COUNT(*)::numeric AS bn,
                 ABS(AVG(prob) - AVG(CASE WHEN ok THEN 1.0 ELSE 0.0 END)) AS gap
          FROM pick GROUP BY 1
        )
        SELECT COUNT(*)::bigint AS n, SUM(CASE WHEN ok THEN 1 ELSE 0 END)::bigint AS hit,
               AVG(POWER((CASE WHEN ok THEN 1 ELSE 0 END) - prob, 2)) AS brier,
               (SELECT SUM(bn * gap) / SUM(bn) FROM pb) AS ece
        FROM pick`,

      prisma.$queryRaw<{ model: string; grp: string; n: bigint; hit: bigint }[]>`
        SELECT p.model, CASE WHEN m.league = ANY(${BASEBALL}) THEN 'baseball' ELSE 'other' END AS grp,
               COUNT(*)::bigint AS n, SUM(CASE WHEN p.correct THEN 1 ELSE 0 END)::bigint AS hit
        FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime" AND p.market = '1X2'
        GROUP BY 1, 2`,

      // 짝지은 비교 — 독립 신뢰구간은 겹쳐도 같은 경기 기준으론 갈릴 수 있다
      prisma.$queryRaw<{ model: string; n: bigint; market_only: bigint; model_only: bigint }[]>`
        WITH mk AS (
          SELECT m.id,
                 (CASE WHEN m."marketHome" >= GREATEST(COALESCE(m."marketDraw",0), m."marketAway") THEN 'HOME'
                       WHEN m."marketAway" >= GREATEST(COALESCE(m."marketDraw",0), m."marketHome") THEN 'AWAY'
                       ELSE 'DRAW' END)
                 = (CASE WHEN m."homeScore" > m."awayScore" THEN 'HOME'
                         WHEN m."awayScore" > m."homeScore" THEN 'AWAY' ELSE 'DRAW' END) AS ok
          FROM "Match" m
          WHERE m."marketHome" IS NOT NULL AND m."marketAway" IS NOT NULL
            AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
        )
        SELECT p.model, COUNT(*)::bigint AS n,
               SUM(CASE WHEN mk.ok AND NOT p.correct THEN 1 ELSE 0 END)::bigint AS market_only,
               SUM(CASE WHEN p.correct AND NOT mk.ok THEN 1 ELSE 0 END)::bigint AS model_only
        FROM "AiPrediction" p
        JOIN "Match" m ON m.id = p."matchId"
        JOIN mk ON mk.id = m.id
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime" AND p.market = '1X2'
        GROUP BY 1 HAVING COUNT(*) >= 200 ORDER BY 2 DESC`,

      prisma.$queryRaw<{ claimed: number; actual: number; n: bigint }[]>`
        WITH mm AS (
          SELECT DISTINCT m.id, m."marketHome" h, m."marketDraw" d, m."marketAway" a,
                 m."homeScore" hs, m."awayScore" aws
          FROM "Match" m
          WHERE m.id IN (
            SELECT p."matchId" FROM "AiPrediction" p JOIN "Match" m2 ON m2.id = p."matchId"
            WHERE p.correct IS NOT NULL AND p.market = '1X2' AND p."predictedAt" < m2."startTime")
            AND m."marketHome" IS NOT NULL AND m."marketAway" IS NOT NULL
            AND m."homeScore" IS NOT NULL AND m."awayScore" IS NOT NULL
        ), pick AS (
          SELECT GREATEST(h, COALESCE(d, 0), a) AS prob,
                 (CASE WHEN h >= GREATEST(COALESCE(d,0), a) THEN 'HOME'
                       WHEN a >= GREATEST(COALESCE(d,0), h) THEN 'AWAY' ELSE 'DRAW' END)
                 = (CASE WHEN hs > aws THEN 'HOME' WHEN aws > hs THEN 'AWAY' ELSE 'DRAW' END) AS ok
          FROM mm
        )
        SELECT AVG(prob) AS claimed, AVG(CASE WHEN ok THEN 1.0 ELSE 0.0 END) AS actual,
               COUNT(*)::bigint AS n
        FROM pick GROUP BY width_bucket(prob, ${BIN_LO}::float8, ${BIN_HI}::float8, ${BIN_COUNT}::int)
        HAVING COUNT(*) >= ${MIN_BIN_N}::int ORDER BY 1`,

      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n
        FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime"
          AND p.market = '1X2' AND p.model <> 'scorebase'`,

      prisma.$queryRaw<{ league: string; n: bigint }[]>`
        SELECT m.league, COUNT(*)::bigint AS n
        FROM "AiPrediction" p JOIN "Match" m ON m.id = p."matchId"
        WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime"
        GROUP BY 1 ORDER BY 2 DESC`,
    ]);

  const s = scale[0];
  const perModel: ModelStat[] = modelRows.map((r) => {
    const n = Number(r.n), hit = Number(r.hit);
    return {
      model: r.model, n, hit, accuracy: hit / n, ci: wald(hit, n),
      brier: Number(r.brier), ece: Number(r.ece ?? 0),
    };
  });

  const mk = marketRow[0];
  const market: ModelStat | null = mk && Number(mk.n) > 0
    ? {
        model: "market", n: Number(mk.n), hit: Number(mk.hit),
        accuracy: Number(mk.hit) / Number(mk.n), ci: wald(Number(mk.hit), Number(mk.n)),
        brier: Number(mk.brier), ece: Number(mk.ece ?? 0),
      }
    : null;

  const splitMap = new Map<string, SportSplit>();
  for (const r of splitRows) {
    const cur = splitMap.get(r.model) ?? {
      model: r.model, baseballN: 0, baseballAcc: null, otherN: 0, otherAcc: null,
    };
    const n = Number(r.n), acc = n ? Number(r.hit) / n : null;
    if (r.grp === "baseball") { cur.baseballN = n; cur.baseballAcc = acc; }
    else { cur.otherN = n; cur.otherAcc = acc; }
    splitMap.set(r.model, cur);
  }

  const paired: PairedTest[] = pairedRows.map((r) => {
    const b = Number(r.market_only), c = Number(r.model_only);
    const chi2 = b + c > 0 ? Math.pow(Math.abs(b - c) - 1, 2) / (b + c) : 0;
    return { model: r.model, marketOnly: b, modelOnly: c, n: Number(r.n), chi2, p: chiSqP(chi2) };
  });

  return {
    scored: Number(s?.scored ?? 0),
    matches: Number(s?.matches ?? 0),
    models: Number(s?.models ?? 0),
    from: s?.d0 ?? "", to: s?.d1 ?? "",
    excluded: Number(excludedRow[0]?.n ?? 0),
    calibration: calRows.map(toBin),
    calibrationTotal: Number(calTotalRow[0]?.n ?? 0),
    calibrationHidden:
      Number(calTotalRow[0]?.n ?? 0) - calRows.reduce((a, r) => a + Number(r.n), 0),
    marketCalibration: mktCalRows.map(toBin),
    perModel, market,
    sportSplit: [...splitMap.values()].sort((a, b) => b.baseballN + b.otherN - (a.baseballN + a.otherN)),
    paired,
    leagues: leagueRows.map((r) => ({ league: r.league, n: Number(r.n) })),
  };
}

/** 20,000행 넘는 집계라 캐시한다. 예측은 하루 단위로 늘어나므로 1시간이면 충분하다. */
export const getBenchmarkData = unstable_cache(computeBenchmark, ["llm-benchmark-v1"], {
  revalidate: 3600,
});

/* ============================================================
 * 원본 데이터 내려받기 — 페이지의 모든 수치를 남이 직접 재현할 수 있어야 한다.
 * 집계만 공개하면 "당신 계산을 믿으라" 가 되므로 예측 한 건 한 건을 낸다.
 * ==========================================================*/

export interface BenchmarkRow {
  prediction_id: number;
  event_id: number;
  league: string;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
  predicted_at_utc: string;
  model: string;
  market: string;
  pick: string;
  stated_prob: number;
  line: number | null;
  correct: 0 | 1;
  home_score: number | null;
  away_score: number | null;
  outcome_1x2: string | null;
  market_prob_home: number | null;
  market_prob_draw: number | null;
  market_prob_away: number | null;
}

/** 채점이 끝난 예측만. 킥오프 전 조건은 페이지 집계와 동일하게 SQL 에서 건다. */
export async function loadBenchmarkRows(): Promise<BenchmarkRow[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT p.id AS prediction_id, m.id AS event_id, m.league,
           ht.name AS home_team, at.name AS away_team,
           to_char(m."startTime" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS kickoff_utc,
           to_char(p."predictedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS predicted_at_utc,
           p.model, p.market, p.pick, p.prob AS stated_prob, p.line,
           (CASE WHEN p.correct THEN 1 ELSE 0 END) AS correct,
           m."homeScore" AS home_score, m."awayScore" AS away_score,
           (CASE WHEN m."homeScore" IS NULL OR m."awayScore" IS NULL THEN NULL
                 WHEN m."homeScore" > m."awayScore" THEN 'HOME'
                 WHEN m."awayScore" > m."homeScore" THEN 'AWAY' ELSE 'DRAW' END) AS outcome_1x2,
           m."marketHome" AS market_prob_home, m."marketDraw" AS market_prob_draw,
           m."marketAway" AS market_prob_away
    FROM "AiPrediction" p
    JOIN "Match" m ON m.id = p."matchId"
    JOIN "Team" ht ON ht.id = m."homeTeamId"
    JOIN "Team" at ON at.id = m."awayTeamId"
    WHERE p.correct IS NOT NULL AND p."predictedAt" < m."startTime"
    ORDER BY m."startTime", m.id, p.model, p.market`;
  return rows as unknown as BenchmarkRow[];
}

/** 팀명은 DB 에 한글인 리그가 있다(KBO·NPB·e스포츠) — 영문 데이터셋이라 되돌린다. */
export const BENCHMARK_COLUMNS: (keyof BenchmarkRow)[] = [
  "prediction_id", "event_id", "league", "home_team", "away_team",
  "kickoff_utc", "predicted_at_utc", "model", "market", "pick",
  "stated_prob", "line", "correct", "home_score", "away_score",
  "outcome_1x2", "market_prob_home", "market_prob_draw", "market_prob_away",
];

export const BENCHMARK_LICENSE = "CC BY 4.0";
export const BENCHMARK_ATTRIBUTION = "Scorebase LLM Forecasting Benchmark — https://www.scorebase.kr/en/benchmark";
