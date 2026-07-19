// 단일 경기 5,000회 시뮬 엔진 — 페이지 표시 확률(저장 pred)로 승무패 주사위를 던지고,
// 종목 엔진(축구 Poisson·야구 baseball-poisson·농구/하키 SPORT_PROFILE Normal)으로 스코어 분포를 만든다.
// "검증"이 아니라 "모델 속 열어보기"용 — 엔진 암시 승률이 표시 승률과 크게 어긋나면
// 스코어 섹션만 생략한다(MatchInsight 드리프트 가드와 같은 정직 원칙).
// Elo 히스토리 재계산 금지 — Match 저장 필드만 사용.

import { prisma } from "@/lib/db";
import { leagueHasDraw } from "@/lib/sports/sport-leagues";
import { buildScoreDistribution } from "./score-distribution";
import { calculateInningScoreProbs } from "./baseball-poisson";
import { getSportProfile } from "./markets";
import { getParkFactor } from "./park-factors";

const N = 5000;
const BASEBALL_LEAGUES = new Set(["MLB", "KBO", "NPB"]);
const NORMAL_LEAGUES = new Set(["NBA", "NHL"]); // margin/total Normal 프로필 종목
const DRIFT_LIMIT = 0.08; // 엔진 암시 홈 승률 vs 표시 홈 승률 — 초과 시 스코어 섹션 생략
const LEAGUE_AVG_ERA = 4.2; // baseball-poisson 과 동일 기준
const TOP_K = 5;

export interface SimScoreEntry {
  label: string;
  count: number;
}

export interface SimResult {
  ok: true;
  n: number;
  league: string;
  /** 주사위에 쓴 표시 확률 (Match 저장 pred 그대로) */
  used: { home: number; draw: number; away: number };
  /** 승무패 주사위 결과 카운트 */
  outcomes: { home: number; draw: number; away: number };
  /** 스코어 분포 TOP5 — 드리프트 가드에 걸리면 null */
  scores: { type: "score" | "margin"; top: SimScoreEntry[] } | null;
  /** OU 라인 통과율 — 스코어 섹션과 같은 샘플에서 집계. 생략 시 null */
  ou: { line: number; over: number } | null;
  /** 스코어 섹션 생략 사유 ("drift") — 없으면 null */
  omitted: "drift" | null;
}

export type SimError = { ok: false; status: number; error: string };

export function simSupportedLeague(league: string): boolean {
  return (
    leagueHasDraw(league) ||
    BASEBALL_LEAGUES.has(league) ||
    NORMAL_LEAGUES.has(league)
  );
}

export async function simulateMatch(matchId: number): Promise<SimResult | SimError> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      league: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      homeStarter: true,
      awayStarter: true,
      oddsTotalLine: true,
      homeTeam: { select: { name: true } },
    },
  });
  if (!m) return { ok: false, status: 404, error: "match not found" };
  if (!simSupportedLeague(m.league))
    return { ok: false, status: 400, error: "unsupported league" };
  // 표시 확률 = 저장 pred (MatchInsight 저장값 고정 조건과 동일 — 3필드 전부 필요)
  if (m.predHome == null || m.predDraw == null || m.predAway == null)
    return { ok: false, status: 400, error: "no stored prediction" };

  const used = { home: m.predHome, draw: m.predDraw, away: m.predAway };
  const sum = used.home + used.draw + used.away;
  if (!(sum > 0)) return { ok: false, status: 400, error: "invalid prediction" };

  // === 승무패 주사위 — 표시 확률 그대로 5,000회 categorical ===
  const outcomes = { home: 0, draw: 0, away: 0 };
  for (let i = 0; i < N; i++) {
    const r = Math.random() * sum;
    if (r < used.home) outcomes.home++;
    else if (r < used.home + used.draw) outcomes.draw++;
    else outcomes.away++;
  }

  // === 스코어 분포 — 종목 엔진 ===
  let scores: SimResult["scores"] = null;
  let ou: SimResult["ou"] = null;
  let omitted: SimResult["omitted"] = null;

  const norm = {
    home: used.home / sum,
    draw: used.draw / sum,
    away: used.away / sum,
  };
  const pHomeTwoWay = clamp(
    norm.home / Math.max(1e-9, norm.home + norm.away),
    0.02,
    0.98,
  );
  const profile = getSportProfile(m.league);

  if (leagueHasDraw(m.league)) {
    // 축구 — score-distribution.ts Poisson λ 그대로 샘플링
    const dist = buildScoreDistribution(norm, m.league);
    const implied = impliedFromPoisson(dist.lambdaHome, dist.lambdaAway);
    if (Math.abs(implied.home - norm.home) > DRIFT_LIMIT) {
      omitted = "drift";
    } else {
      const line = profile?.overLine ?? 2.5;
      const counter = new Map<string, number>();
      let over = 0;
      for (let i = 0; i < N; i++) {
        const h = samplePoisson(dist.lambdaHome);
        const a = samplePoisson(dist.lambdaAway);
        bump(counter, `${h}-${a}`);
        if (h + a > line) over++;
      }
      scores = { type: "score", top: topEntries(counter) };
      ou = { line, over };
    }
  } else if (BASEBALL_LEAGUES.has(m.league) && profile) {
    // 야구 — baseball-poisson 엔진. 팀 평균은 리그 기준선(overLine/2), 선발 ERA·구장만 저장 필드.
    const homeEra = starterEra(m.homeStarter) ?? LEAGUE_AVG_ERA;
    const awayEra = starterEra(m.awayStarter) ?? LEAGUE_AVG_ERA;
    const base = profile.overLine / 2;
    const park = getParkFactor(
      m.league as "KBO" | "NPB" | "MLB",
      m.homeTeam.name,
    );
    const out = calculateInningScoreProbs({
      team1AvgRpg: base,
      team1AvgRApg: base,
      team2AvgRpg: base,
      team2AvgRApg: base,
      team1StarterEra: awayEra,
      team2StarterEra: homeEra,
      team1StarterInnings: 5.5,
      team2StarterInnings: 5.5,
      team1BullpenEra: LEAGUE_AVG_ERA,
      team2BullpenEra: LEAGUE_AVG_ERA,
      parkFactor: park,
      team1RecentForm: 0,
      team2RecentForm: 0,
    });
    // team1=원정, team2=홈 (baseball-poisson 규약)
    if (Math.abs(out.winProb.team2 - pHomeTwoWay) > DRIFT_LIMIT) {
      omitted = "drift";
    } else {
      const lambdaHome = Math.max(0.1, out.totalExpectedRuns.team2);
      const lambdaAway = Math.max(0.1, out.totalExpectedRuns.team1);
      const perH = Math.max(0.05, lambdaHome / 9);
      const perA = Math.max(0.05, lambdaAway / 9);
      const counter = new Map<string, number>();
      let over = 0;
      for (let i = 0; i < N; i++) {
        let h = samplePoisson(lambdaHome);
        let a = samplePoisson(lambdaAway);
        // 동점 → 연장 이닝 (사이트 야구 예측은 승패 2지선다 통일)
        for (let x = 0; x < 15 && h === a; x++) {
          h += samplePoisson(perH);
          a += samplePoisson(perA);
        }
        if (h === a) {
          if (Math.random() < pHomeTwoWay) h++;
          else a++;
        }
        bump(counter, `${h}-${a}`);
        if (h + a > profile.overLine) over++;
      }
      scores = { type: "score", top: topEntries(counter) };
      ou = { line: profile.overLine, over };
    }
  } else if (NORMAL_LEAGUES.has(m.league) && profile) {
    // 농구/하키 — SPORT_PROFILE Normal. 마진 평균은 표시 승률에서 역산(구성상 드리프트 없음).
    const muMargin = profile.marginStd * invNorm(pHomeTwoWay);
    const totalCenter = m.oddsTotalLine ?? profile.overLine;
    const counter = new Map<string, number>();
    let over = 0;
    for (let i = 0; i < N; i++) {
      const margin = randNormal(muMargin, profile.marginStd);
      const total = Math.max(1, randNormal(totalCenter, profile.totalStd));
      let h = Math.round((total + margin) / 2);
      let a = Math.round((total - margin) / 2);
      if (h < 0) h = 0;
      if (a < 0) a = 0;
      // 승자 보정 — 동점 없음(연장/승부치기). margin 부호가 승자.
      if (margin > 0 && h <= a) h = a + 1;
      else if (margin < 0 && a <= h) a = h + 1;
      if (m.league === "NBA") {
        const win = h > a;
        const diff = Math.abs(h - a);
        const b = Math.min(4, Math.floor((diff - 1) / 5));
        const range = b === 4 ? "21점차 이상" : `${b * 5 + 1}~${b * 5 + 5}점차`;
        bump(counter, `${win ? "홈" : "원정"} ${range} 승`);
      } else {
        bump(counter, `${h}-${a}`);
      }
      if (h + a > profile.overLine) over++;
    }
    scores = {
      type: m.league === "NBA" ? "margin" : "score",
      top: topEntries(counter),
    };
    ou = { line: profile.overLine, over };
  }

  return { ok: true, n: N, league: m.league, used, outcomes, scores, ou, omitted };
}

// ============================================================
// helpers
// ============================================================

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries(map: Map<string, number>): SimScoreEntry[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([label, count]) => ({ label, count }));
}

function starterEra(json: string | null): number | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as { era?: number };
    return typeof s.era === "number" && Number.isFinite(s.era) ? s.era : null;
  } catch {
    return null;
  }
}

/** Knuth 알고리즘 — baseball-poisson 과 동일 방식 (λ 작을 때 안정) */
function samplePoisson(lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

/** Box-Muller 정규분포 샘플 */
function randNormal(mean: number, std: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function poissonPmf(k: number, lambda: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logFact = 0;
  for (let i = 2; i <= k; i++) logFact += Math.log(i);
  return Math.exp(k * Math.log(lambda) - lambda - logFact);
}

/** Poisson λ 쌍이 암시하는 1X2 — 드리프트 가드용 해석 계산 */
function impliedFromPoisson(
  lh: number,
  la: number,
): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = poissonPmf(h, lh) * poissonPmf(a, la);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
    }
  }
  const s = home + draw + away;
  return { home: home / s, draw: draw / s, away: away / s };
}

/** 표준정규 역함수 — Acklam 근사 (마진 평균 역산용) */
function invNorm(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
