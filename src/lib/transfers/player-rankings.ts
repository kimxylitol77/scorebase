// 선수 랭킹(종합·유망주·상승률·가성비·폼·트로피·계약) — /transfers 랭킹 뷰의 집계(6h/24h 캐시)와 순수 계산 함수.
// 후보 풀은 몸값 표와 같은 enriched 집합을 호출부가 넘긴다(표기 일치). 계산 근거는 docs/transfers-rankings.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

/** 이번 시즌 선수별 누적 — PlayerMatchLog(ts id) group by. rating 은 분 가중 평균. */
export interface SeasonPlayerStat {
  n: number; // 출전 경기
  starts: number;
  mins: number;
  g: number;
  a: number;
  ratedN: number; // 평점 있고 10분 이상 뛴 경기 수
  rating: number | null; // 분 가중 평균 평점
  recent5: number | null; // 최근 5경기(평점 있는) 단순 평균 — 폼
  recent5N: number;
}

/** 유럽 시즌 시작(7/1). 7월 이후면 올해, 아니면 작년. */
export function seasonStartUtc(now = new Date()): Date {
  const y = now.getUTCFullYear();
  return new Date(Date.UTC(now.getUTCMonth() >= 6 ? y : y - 1, 6, 1));
}

interface RawAgg {
  playerId: string; n: number; starts: number; mins: number; g: number; a: number; ratedN: number; ratingW: number | null;
  recent5: number | null; recent5N: number;
}

export const getSeasonPlayerStats = unstable_cache(
  async (): Promise<Record<string, SeasonPlayerStat>> => {
    const since = seasonStartUtc();
    const rows = await prisma.$queryRaw<RawAgg[]>`
      WITH l AS (
        SELECT "playerId", minutes, goals, assists, started, rating,
          -- 폼 창(최근 5경기)은 실제로 뛴 경기만: 0~9분 교체·미출전 행에 붙는 1점대 평점이 콜드 랭킹을 오염시킨다(2026-09-20 실측).
          (rating IS NOT NULL AND COALESCE(minutes, 0) >= 10) AS played,
          ROW_NUMBER() OVER (PARTITION BY "playerId" ORDER BY (rating IS NULL OR COALESCE(minutes, 0) < 10), date DESC) AS rn
        FROM "PlayerMatchLog" WHERE date >= ${since}
      )
      SELECT "playerId",
        COUNT(*)::int AS n,
        COUNT(*) FILTER (WHERE started)::int AS starts,
        COALESCE(SUM(minutes), 0)::int AS mins,
        COALESCE(SUM(goals), 0)::int AS g,
        COALESCE(SUM(assists), 0)::int AS a,
        COUNT(*) FILTER (WHERE played)::int AS "ratedN",
        CASE WHEN COALESCE(SUM(minutes) FILTER (WHERE rating IS NOT NULL), 0) > 0
          THEN SUM(rating * minutes) FILTER (WHERE rating IS NOT NULL) / SUM(minutes) FILTER (WHERE rating IS NOT NULL)
          ELSE AVG(rating) END AS "ratingW",
        AVG(rating) FILTER (WHERE played AND rn <= 5) AS recent5,
        COUNT(*) FILTER (WHERE played AND rn <= 5)::int AS "recent5N"
      FROM l
      GROUP BY "playerId"`;
    const out: Record<string, SeasonPlayerStat> = {};
    for (const r of rows) {
      out[r.playerId] = {
        n: r.n, starts: r.starts, mins: r.mins, g: r.g, a: r.a, ratedN: r.ratedN,
        rating: r.ratingW == null ? null : Math.round(Number(r.ratingW) * 100) / 100,
        recent5: r.recent5 == null ? null : Math.round(Number(r.recent5) * 100) / 100,
        recent5N: r.recent5N,
      };
    }
    return out;
  },
  ["transfers-season-player-stats-v3"],
  { revalidate: 6 * 3600, tags: ["transfers-season-player-stats"] },
);

// ── 순수 계산 ─────────────────────────────────────────────────────────────

export type PosGroup = "ATT" | "MID" | "DEF" | "GK";
export function posGroupOf(posCode: string | null | undefined): PosGroup {
  switch (posCode) {
    case "GK": return "GK";
    case "CB": case "FB": case "DF": return "DEF";
    case "DM": case "CM": case "MF": return "MID";
    default: return "ATT"; // ST·W·AM·FW·미상
  }
}

/** 종합 지수 가중치(합 100) — 포지션 그룹별. 수비·GK 는 골 기여 대신 평점·출전 비중. */
export const POWER_WEIGHTS: Record<PosGroup, { rating: number; ga90: number; mins: number; value: number; trend: number }> = {
  ATT: { rating: 35, ga90: 30, mins: 15, value: 12, trend: 8 },
  MID: { rating: 40, ga90: 20, mins: 18, value: 14, trend: 8 },
  DEF: { rating: 45, ga90: 10, mins: 20, value: 17, trend: 8 },
  GK: { rating: 45, ga90: 0, mins: 25, value: 20, trend: 10 },
};
export const POWER_MIN_MINUTES = 180;
export const POWER_MIN_RATED = 3;
export const PROSPECT_MIN_MINUTES = 90;
export const PROSPECT_MAX_AGE = 21;
export const GROWTH_MIN_BASE = 1; // €M, 1년 전
export const GROWTH_MIN_CURRENT = 2; // €M

export interface RankInput {
  id: string;
  value: number; // €M 현재
  v1y: number | null; // €M 1년 전
  age: number | null;
  posCode: string | null;
  stat: SeasonPlayerStat | null;
}

export interface PowerBreakdown { rating: number; ga90: number; mins: number; value: number; trend: number }
export interface PowerRow { id: string; score: number; parts: PowerBreakdown; ga90: number; trendPct: number | null }

/** 0~100 백분위(동점은 평균 순위). values 가 비면 빈 Map. */
export function percentiles(entries: Array<[string, number]>): Map<string, number> {
  const out = new Map<string, number>();
  if (entries.length === 0) return out;
  if (entries.length === 1) { out.set(entries[0][0], 100); return out; }
  const sorted = [...entries].sort((a, b) => a[1] - b[1]);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][1] === sorted[i][1]) j++;
    const rank = (i + j) / 2; // 0-based 평균 순위
    const pct = (rank / (sorted.length - 1)) * 100;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], pct);
    i = j + 1;
  }
  return out;
}

export function trendPctOf(value: number, v1y: number | null): number | null {
  if (v1y == null || v1y <= 0) return null;
  return Math.max(-80, Math.min(300, ((value - v1y) / v1y) * 100));
}

/** 종합 지수 — 자격(180분·평점 3경기) 충족 선수만 순위. 반환은 점수 내림차순. */
export function computePowerRanking(pool: RankInput[]): PowerRow[] {
  const elig = pool.filter((p) => p.stat && p.stat.mins >= POWER_MIN_MINUTES && p.stat.ratedN >= POWER_MIN_RATED && p.stat.rating != null);
  if (elig.length === 0) return [];
  const groupOf = (p: RankInput) => posGroupOf(p.posCode);
  const ga90Of = (p: RankInput) => ((p.stat!.g + p.stat!.a) / p.stat!.mins) * 90;
  // 포지션 그룹 내 백분위(평점·GA90), 전체 풀 백분위(출전·몸값·추세)
  const ratingPct = new Map<string, number>();
  const ga90Pct = new Map<string, number>();
  for (const grp of ["ATT", "MID", "DEF", "GK"] as PosGroup[]) {
    const g = elig.filter((p) => groupOf(p) === grp);
    for (const [id, v] of percentiles(g.map((p) => [p.id, p.stat!.rating!]))) ratingPct.set(id, v);
    for (const [id, v] of percentiles(g.map((p) => [p.id, ga90Of(p)]))) ga90Pct.set(id, v);
  }
  const minsPct = percentiles(elig.map((p) => [p.id, p.stat!.mins]));
  const valuePct = percentiles(elig.map((p) => [p.id, Math.log(Math.max(0.1, p.value))]));
  const trendEntries = elig.map((p) => [p.id, trendPctOf(p.value, p.v1y)] as const).filter((e): e is readonly [string, number] => e[1] != null);
  const trendPct = percentiles(trendEntries.map(([id, v]) => [id, v]));
  return elig
    .map((p) => {
      const w = POWER_WEIGHTS[groupOf(p)];
      const parts: PowerBreakdown = {
        rating: ratingPct.get(p.id) ?? 0,
        ga90: ga90Pct.get(p.id) ?? 0,
        mins: minsPct.get(p.id) ?? 0,
        value: valuePct.get(p.id) ?? 0,
        trend: trendPct.get(p.id) ?? 50, // 이력 없으면 중립
      };
      const score = (parts.rating * w.rating + parts.ga90 * w.ga90 + parts.mins * w.mins + parts.value * w.value + parts.trend * w.trend) / 100;
      return { id: p.id, score: Math.round(score * 10) / 10, parts, ga90: Math.round(ga90Of(p) * 100) / 100, trendPct: trendPctOf(p.value, p.v1y) };
    })
    .sort((a, b) => b.score - a.score || b.parts.rating - a.parts.rating);
}

export interface ProspectRow { id: string; score: number; parts: { value: number; rating: number; mins: number }; ageBonus: number }

/** 유망주 지수 — maxAge 이하·90분 이상. 풀 안에서 백분위, 나이 보정 후 100 상한. */
export function computeProspectRanking(pool: RankInput[], maxAge = PROSPECT_MAX_AGE): ProspectRow[] {
  const elig = pool.filter((p) => p.age != null && p.age <= maxAge && p.stat && p.stat.mins >= PROSPECT_MIN_MINUTES);
  if (elig.length === 0) return [];
  const valuePct = percentiles(elig.map((p) => [p.id, Math.log(Math.max(0.1, p.value))]));
  const minsPct = percentiles(elig.map((p) => [p.id, p.stat!.mins]));
  const ratingPct = new Map<string, number>();
  for (const grp of ["ATT", "MID", "DEF", "GK"] as PosGroup[]) {
    const g = elig.filter((p) => posGroupOf(p.posCode) === grp && p.stat!.ratedN >= 2 && p.stat!.rating != null);
    for (const [id, v] of percentiles(g.map((p) => [p.id, p.stat!.rating!]))) ratingPct.set(id, v);
  }
  return elig
    .map((p) => {
      const parts = { value: valuePct.get(p.id) ?? 0, rating: ratingPct.get(p.id) ?? 40, mins: minsPct.get(p.id) ?? 0 };
      const base = parts.value * 0.5 + parts.rating * 0.3 + parts.mins * 0.2;
      const ageBonus = 1 + 0.04 * Math.max(0, maxAge - (p.age ?? maxAge));
      return { id: p.id, score: Math.round(Math.min(100, base * ageBonus) * 10) / 10, parts, ageBonus };
    })
    .sort((a, b) => b.score - a.score || b.parts.value - a.parts.value);
}

export type GrowthMode = "pct" | "abs" | "down";
export interface GrowthRow { id: string; v1y: number; pct: number; abs: number }

/** 1년 몸값 변동 — 노이즈 컷(1년 전 1M·현재 2M). mode 별 정렬. */
export function computeGrowthRanking(pool: RankInput[], mode: GrowthMode = "pct"): GrowthRow[] {
  const rows = pool
    .filter((p) => p.v1y != null && p.v1y >= GROWTH_MIN_BASE && p.value >= GROWTH_MIN_CURRENT)
    .map((p) => ({ id: p.id, v1y: p.v1y!, pct: Math.round(((p.value - p.v1y!) / p.v1y!) * 100), abs: Math.round((p.value - p.v1y!) * 10) / 10 }));
  if (mode === "down") return rows.filter((r) => r.abs < 0).sort((a, b) => a.pct - b.pct || a.abs - b.abs);
  const up = rows.filter((r) => r.abs > 0);
  return mode === "abs" ? up.sort((a, b) => b.abs - a.abs || b.pct - a.pct) : up.sort((a, b) => b.pct - a.pct || b.abs - a.abs);
}

// ── 2단계: 가성비·폼·트로피·계약 만료 ─────────────────────────────────────

export const BARGAIN_MIN_VALUE = 3; // €M
export interface BargainRow { id: string; score: number; power: number; valuePct: number }

/** 가성비 = 종합 지수 − 몸값 백분위. 종합 자격 선수 중 몸값 3M 이상. 값이 클수록 몸값 대비 성과가 높다. */
export function computeBargainRanking(pool: RankInput[]): BargainRow[] {
  const power = computePowerRanking(pool);
  if (power.length === 0) return [];
  const byId = new Map(pool.map((p) => [p.id, p]));
  const elig = power.filter((r) => (byId.get(r.id)?.value ?? 0) >= BARGAIN_MIN_VALUE);
  const valuePct = percentiles(elig.map((r) => [r.id, Math.log(byId.get(r.id)!.value)]));
  return elig
    .map((r) => {
      const vp = valuePct.get(r.id) ?? 0;
      return { id: r.id, score: Math.round((r.score - vp) * 10) / 10, power: r.score, valuePct: vp };
    })
    .sort((a, b) => b.score - a.score || b.power - a.power);
}

export const FORM_MIN_RECENT = 5;
export type FormMode = "hot" | "cold";
export interface FormRow { id: string; recent5: number; season: number | null; delta: number | null }

/** 폼 = 최근 5경기(평점 있는) 평균 평점. hot 은 높은 순, cold 는 낮은 순. 시즌 평균 대비 차이를 같이 준다. */
export function computeFormRanking(pool: RankInput[], mode: FormMode = "hot"): FormRow[] {
  const rows = pool
    .filter((p) => p.stat && p.stat.recent5 != null && p.stat.recent5N >= FORM_MIN_RECENT)
    .map((p) => {
      const season = p.stat!.rating;
      return { id: p.id, recent5: p.stat!.recent5!, season, delta: season == null ? null : Math.round((p.stat!.recent5! - season) * 100) / 100 };
    });
  return mode === "cold"
    ? rows.sort((a, b) => a.recent5 - b.recent5 || (a.delta ?? 0) - (b.delta ?? 0))
    : rows.sort((a, b) => b.recent5 - a.recent5 || (b.delta ?? 0) - (a.delta ?? 0));
}

/** 트로피 점수표 — PlayerTrophy.league(af 대회명) → 점수. 유스·프리시즌·올스타는 0(제외). 미등재 시니어 대회는 1. */
const TROPHY_POINTS: Record<string, number> = {
  "FIFA World Cup": 12,
  "UEFA Champions League": 10,
  "UEFA European Championship": 8, "CONMEBOL Copa America": 8, "CONMEBOL Libertadores": 8, "CAF Africa Cup of Nations": 8,
  "Premier League": 6, "La Liga": 6, "Serie A": 6, "Bundesliga": 6, "Ligue 1": 6, "FIFA Club World Cup": 6,
  "UEFA Europa League": 5, "UEFA Nations League": 5, "CONMEBOL/UEFA Finalissima": 5, "Olympics Men": 5,
  "Eredivisie": 4, "Primeira Liga": 4, "First Division A": 4, "Super League": 4, "Superliga": 4, "HNL": 4, "Premiership": 4,
  "Super League 1": 4, "Liga Profesional Argentina": 4, "Czech Liga": 4, "Süper Lig": 4, "Ekstraklasa": 4, "Allsvenskan": 4,
  "J1 League": 4, "Primera División": 4, "Liga AUF": 4, "Super Liga": 4, "1. Division": 4, "K League 1": 4, "MLS": 4, "Liga MX": 4,
  "FA Cup": 3, "Copa del Rey": 3, "DFB Pokal": 3, "Coppa Italia": 3, "Coupe de France": 3, "Cup": 3, "KNVB Beker": 3,
  "Taça de Portugal": 3, "Scottish Cup": 3, "Schweizer Pokal": 3, "DBU Pokalen": 3, "Copa do Brasil": 3, "Copa Argentina": 3,
  "UEFA Conference League": 3, "CONMEBOL Sudamericana": 3, "Concacaf Nations League": 3, "CONMEBOL Recopa": 3, "Korea Cup": 3,
  "League Cup": 2, "Taça da Liga": 2, "Championship": 2, "2. Bundesliga": 2, "Serie B": 2, "Ligue 2": 2, "Segunda División": 2,
  "League One": 2, "Eerste Divisie": 2, "3. Liga": 2, "Primera División RFEF": 2, "Challenger Pro League": 2, "Paulista A1": 2,
  "Carioca Série A": 2, "Paranaense 1": 2, "FIFA Intercontinental Cup": 2, "UEFA Super Cup": 2, "Coppa Italia Serie C": 2,
  "Super Cup": 1, "Community Shield": 1, "Trophée des Champions": 1, "Super Copa": 1, "Supercopa do Brasil": 1, "UEFA/CONMEBOL Club Challenge": 1,
};
const TROPHY_ZERO = /U1[5-9]|U2[0-3]|Youth|Primavera|Juvenil|Junior|Júniores|Jugend|Divisie 1|Premier League 2|International Cup|Premier League Cup|Joan Gamper|Emirates Cup|World Challenge|Florida Cup|Summer Series|Berlusconi|Asia Trophy|All-Star|Atlantic Cup|Copa Catalunya|Champions Cup|Maurice Revello|Friendl/i;
export function trophyPoints(league: string): number {
  if (league in TROPHY_POINTS) return TROPHY_POINTS[league];
  if (TROPHY_ZERO.test(league)) return 0;
  return 1;
}

export interface TrophyInput { playerId: string; league: string; season: string }
export interface TrophyRow { id: string; pts: number; n: number; top: string[] }

/** 현역 트로피 — Winner 행만, 점수 합 내림차순. top = 점수 높은 대회 3개(중복 제거, 횟수 표기). */
export function computeTrophyRanking(rows: TrophyInput[], ids: Set<string>): TrophyRow[] {
  const acc = new Map<string, { pts: number; n: number; by: Map<string, { pts: number; n: number }> }>();
  for (const r of rows) {
    if (!ids.has(r.playerId)) continue;
    const pts = trophyPoints(r.league);
    if (pts <= 0) continue;
    const a = acc.get(r.playerId) || { pts: 0, n: 0, by: new Map() };
    a.pts += pts; a.n += 1;
    const b = a.by.get(r.league) || { pts, n: 0 };
    b.n += 1; a.by.set(r.league, b);
    acc.set(r.playerId, a);
  }
  return [...acc.entries()]
    .map(([id, a]) => ({
      id, pts: a.pts, n: a.n,
      top: [...a.by.entries()].sort((x, y) => y[1].pts - x[1].pts || y[1].n - x[1].n).slice(0, 3).map(([lg, b]) => (b.n > 1 ? `${lg} ×${b.n}` : lg)),
    }))
    .sort((a, b) => b.pts - a.pts || b.n - a.n);
}

export interface ContractRow { id: string; until: number }

/** 계약 만료 예정 — until(epoch 초) 이 now 이후 horizon 이내인 선수를 몸값 내림차순. */
export function computeContractRanking(pool: RankInput[], contract: Record<string, number>, horizonEpoch: number, nowEpoch: number): ContractRow[] {
  return pool
    .flatMap((p) => {
      const until = contract[p.id];
      return until != null && until > nowEpoch && until <= horizonEpoch ? [{ id: p.id, until, value: p.value }] : [];
    })
    .sort((a, b) => b.value - a.value || a.until - b.until)
    .map(({ id, until }) => ({ id, until }));
}

/** 빅5 몸값 선수의 우승 기록(Winner) — 24h 캐시. 트로피 랭킹 재료. */
export const getBig5TrophyWinners = unstable_cache(
  async (): Promise<TrophyInput[]> => {
    return prisma.$queryRaw<TrophyInput[]>`
      SELECT t."playerId", t.league, t.season
      FROM "PlayerTrophy" t
      JOIN "PlayerMarketValue" m ON m.id = t."playerId"
      WHERE t.place = 'Winner' AND m.league IN ('EPL','LALIGA','BUNDESLIGA','SERIE_A','LIGUE_1')`;
  },
  ["transfers-big5-trophy-winners-v1"],
  { revalidate: 24 * 3600, tags: ["transfers-big5-trophy-winners"] },
);

/** 트로피 대회명 한글 — 주요 대회만, 나머지는 원문. */
const TROPHY_KO: Record<string, string> = {
  "FIFA World Cup": "월드컵", "UEFA Champions League": "챔피언스리그", "UEFA European Championship": "유로", "CONMEBOL Copa America": "코파 아메리카",
  "CONMEBOL Libertadores": "리베르타도레스", "CAF Africa Cup of Nations": "네이션스컵", "Premier League": "프리미어리그", "La Liga": "라리가",
  "Serie A": "세리에 A", "Bundesliga": "분데스리가", "Ligue 1": "리그 1", "FIFA Club World Cup": "클럽 월드컵", "UEFA Europa League": "유로파리그",
  "UEFA Nations League": "네이션스리그", "CONMEBOL/UEFA Finalissima": "피날리시마", "Olympics Men": "올림픽", "Eredivisie": "에레디비시",
  "Primeira Liga": "포르투갈 리그", "FA Cup": "FA컵", "Copa del Rey": "코파 델 레이", "DFB Pokal": "DFB 포칼", "Coppa Italia": "코파 이탈리아",
  "Coupe de France": "쿠프 드 프랑스", "Cup": "국내컵", "UEFA Conference League": "컨퍼런스리그", "League Cup": "리그컵", "Championship": "챔피언십",
  "UEFA Super Cup": "UEFA 슈퍼컵", "Super Cup": "슈퍼컵", "Community Shield": "커뮤니티 실드", "Trophée des Champions": "트로페 데 샹피옹",
  "FIFA Intercontinental Cup": "인터컨티넨털컵", "KNVB Beker": "KNVB컵", "Taça de Portugal": "포르투갈컵", "Taça da Liga": "포르투갈 리그컵",
  "2. Bundesliga": "2. 분데스리가", "Serie B": "세리에 B", "Ligue 2": "리그 2", "Segunda División": "세군다", "First Division A": "벨기에 리그",
};
export function trophyKo(label: string): string {
  const m = label.match(/^(.*?)( ×\d+)?$/);
  const base = m?.[1] ?? label;
  return (TROPHY_KO[base] ?? base) + (m?.[2] ?? "");
}
