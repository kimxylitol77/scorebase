// 홈 어드밴티지(HOME_ADVANTAGE_ELO) 재보정 백테스트 — 야구·농구·하키 1X2.
//
// 왜. 시즌 MC 보정 중 2D 스캔에서 홈 100(=승률 64%)이 실측(야구 52.5·하키 51.2·농구 55.6%)
//     대비 과대로 나왔다. 다만 그 스캔은 calcWinProbability 를 날것으로 불렀고, 운영 경로에는
//     home-calibration(Platt) 과 league-prior 가 더 붙는다. 이 스크립트는 **운영 채점 경로를
//     그대로 재현**해서 HA 를 바꿨을 때 실제 적중률·Brier 가 좋아지는지만 본다.
//
// 재현 대상 = evaluate-predictions.runEvaluateMatches 의 1X2 산출 순서:
//   Elo(as-of) → calcWinProbability → blendLeaguePrior → 선발/골리 보정 → 시장 블렌드 → Platt
//   (핸디·OU 는 markets.ts 의 goal 도메인 homeBoost 를 쓰므로 HA 와 무관 — 제외)
//
// HA 변경은 calcWinProbability(eloHome + Δ, eloAway) 로 준다. 함수 내부가 홈 Elo 에
// HA 를 더하는 구조라 Δ 를 홈 Elo 에 더하는 것과 HA 상수를 바꾸는 것이 항등이다.
//
// 사용: npx tsx --env-file=.env.local scripts/_backtest-home-advantage.ts
//       npx tsx --env-file=.env.local scripts/_backtest-home-advantage.ts --elo-ha 20   (elo.ts HA 동시 변경 변형)

import { prisma } from "@/lib/db";
import { applyEloMatch, STARTING_ELO } from "@/lib/predict/elo";
import { calcWinProbability, homeAdvantageFor } from "@/lib/predict/win-probability";
import { blendLeaguePrior, priorWeight } from "@/lib/predict/league-prior";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "@/lib/predict/starter-adjust";
import {
  computeGoalieAdjustment,
  applyGoalieToWinProb,
} from "@/lib/predict/goalie-adjust";
import { blendWithMarket } from "@/lib/predict/market-blend";
import { calibrateHomeWinProb, hasHomeCalibration } from "@/lib/predict/home-calibration";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import type { PredictMatch } from "@/lib/predict/types";

const LEAGUES = ["MLB", "NHL", "NBA", "KBO", "NPB", "LMB", "WNBA", "CPBL"];
const HA_VALUES = [100, 60, 40, 20, 0];
const MIN_PRIOR = 5; // compute-prediction.MIN_PRIOR 와 동일
const FULL_TRUST_SPREAD = 70; // league-prior 내부 상수 (eloSpread 계산 재현용)

// elo.ts 의 HA 를 함께 낮추는 변형 — applyEloMatch 를 못 건드리므로 여기서 재현한다.
// (--elo-ha 미지정이면 운영과 동일한 100)
const eloHaArg = process.argv.indexOf("--elo-ha");
const ELO_HA = eloHaArg >= 0 ? Number(process.argv[eloHaArg + 1]) : 100;

interface Row {
  id: number;
  league: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  startTime: Date;
  homeStarter: string | null;
  awayStarter: string | null;
  homeGoalie: string | null;
  awayGoalie: string | null;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  marketBookmakers: number | null;
}

const parseJson = <T,>(s: string | null): T | null => {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** ratings 맵의 표준편차 — eloSpread 와 동일 정의 (as-of 스냅샷용). */
function spreadOf(ratings: Map<number, number>): number {
  const xs = [...ratings.values()];
  if (xs.length < 2) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
}

/** applyEloMatch 를 ELO_HA 변형으로 쓰기 위한 shim — 홈/원정 Elo 를 대칭 이동시켜 호출한다.
 *  expectedScore(home + ha, away) 는 (home + ha − away) 만의 함수이므로
 *  home 에 (ELO_HA − 100)/2, away 에 −(ELO_HA − 100)/2 를 실어 호출하면 기대값이 정확히 일치하고,
 *  갱신 후 같은 양만큼 되돌리면 K·MoV 를 포함한 전 계산이 ELO_HA 판과 동일해진다. */
function applyEloMatchWithHa(ratings: Map<number, number>, m: PredictMatch): boolean {
  if (ELO_HA === 100) return applyEloMatch(ratings, m);
  // 미종료 매치에 shim 을 태우면 ratings 에 미출전 팀이 1500 으로 들어가 eloSpread 가 오염된다.
  if (m.status !== "FINISHED" || m.homeScore === null || m.awayScore === null) return false;
  const d = (ELO_HA - 100) / 2;
  const h = ratings.get(m.homeTeamId) ?? STARTING_ELO;
  const a = ratings.get(m.awayTeamId) ?? STARTING_ELO;
  ratings.set(m.homeTeamId, h + d);
  ratings.set(m.awayTeamId, a - d);
  const ok = applyEloMatch(ratings, m);
  ratings.set(m.homeTeamId, (ratings.get(m.homeTeamId) ?? STARTING_ELO) - d);
  ratings.set(m.awayTeamId, (ratings.get(m.awayTeamId) ?? STARTING_ELO) + d);
  return ok;
}

/** 한 매치의 예측 확률 — HA 델타만 다르게 준 운영 경로 재현. Platt 은 호출자가 붙인다. */
function predictOne(
  r: Row,
  eloHome: number,
  eloAway: number,
  ha: number,
  base: { home: number; draw: number; away: number } | null,
  spread: number,
) {
  // calcWinProbability 는 내부에서 홈 Elo 에 리그 HA 를 더한다 → 목표값과의 차액만 실어 준다.
  // (상수를 바꾼 뒤 재실행해도 같은 수치가 나오도록 현행값을 읽어서 뺀다)
  let wp = calcWinProbability(eloHome + (ha - homeAdvantageFor(r.league)), eloAway, r.league);
  if (base) wp = blendLeaguePrior(wp, { ...base, sample: 999 }, priorWeight(spread));

  const sAdj = computeStarterAdjustment(
    parseJson(r.homeStarter),
    parseJson(r.awayStarter),
    r.league,
  );
  const gAdj = computeGoalieAdjustment(parseJson(r.homeGoalie), parseJson(r.awayGoalie));
  if (sAdj.applied) wp = applyStarterToWinProb(wp, sAdj);
  if (gAdj.applied) wp = applyGoalieToWinProb(wp, gAdj);

  if (r.marketHome != null && r.marketAway != null) {
    wp = blendWithMarket(
      wp,
      {
        home: r.marketHome,
        draw: r.marketDraw,
        away: r.marketAway,
        bookmakers: r.marketBookmakers,
      },
      { league: r.league },
    );
  }
  return { home: wp.home, draw: wp.draw, away: wp.away };
}

interface Sample {
  /** Platt 적용 전 확률 (재적합 시나리오용) */
  raw: { home: number; draw: number; away: number };
  res: "H" | "D" | "A";
}

/** 리그 하나를 walk-forward 로 훑어 HA 값별 표본을 만든다. */
async function collect(league: string): Promise<Map<number, Sample[]>> {
  const rows = (await prisma.match.findMany({
    where: { league: league as never },
    select: {
      id: true, league: true, status: true,
      homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true, startTime: true,
      homeStarter: true, awayStarter: true,
      homeGoalie: true, awayGoalie: true,
      marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true,
    },
    orderBy: { startTime: "asc" },
  })) as unknown as Row[];

  const out = new Map<number, Sample[]>(HA_VALUES.map((h) => [h, []]));
  const ratings = new Map<number, number>();
  const played = new Map<number, number>();
  // 리그 베이스레이트 누적 (calcLeagueBaseRate 재현 — as-of 이전 FINISHED 전건)
  let bh = 0, bd = 0, ba = 0;

  for (const r of rows) {
    const m = r as unknown as PredictMatch;
    const finished = r.status === "FINISHED" && r.homeScore != null && r.awayScore != null;

    if (finished) {
      const ph = played.get(r.homeTeamId) ?? 0;
      const pa = played.get(r.awayTeamId) ?? 0;
      if (Math.min(ph, pa) >= MIN_PRIOR) {
        const n = bh + bd + ba;
        const base = n >= 30 ? { home: bh / n, draw: bd / n, away: ba / n } : null;
        const spread = spreadOf(ratings);
        const eloHome = ratings.get(r.homeTeamId) ?? STARTING_ELO;
        const eloAway = ratings.get(r.awayTeamId) ?? STARTING_ELO;
        const res: "H" | "D" | "A" =
          r.homeScore! > r.awayScore! ? "H" : r.homeScore! < r.awayScore! ? "A" : "D";
        for (const ha of HA_VALUES) {
          out.get(ha)!.push({ raw: predictOne(r, eloHome, eloAway, ha, base, spread), res });
        }
      }
    }

    if (applyEloMatchWithHa(ratings, m)) {
      played.set(r.homeTeamId, (played.get(r.homeTeamId) ?? 0) + 1);
      played.set(r.awayTeamId, (played.get(r.awayTeamId) ?? 0) + 1);
      if (r.homeScore! > r.awayScore!) bh++;
      else if (r.homeScore! < r.awayScore!) ba++;
      else bd++;
    }
  }
  // priorWeight 가 0 이 되는 기준(stddev 70) 을 로그로 남긴다 — prior 적용 여부 확인용
  void FULL_TRUST_SPREAD;
  return out;
}

/** Platt 적용 후 확률. cal 이 null 이면 그대로. */
function withPlatt(
  p: { home: number; draw: number; away: number },
  cal: { a: number; c: number } | null,
) {
  if (!cal) return p;
  const q = Math.min(0.99, Math.max(0.01, p.home));
  const l = Math.log(q / (1 - q));
  const h = 1 / (1 + Math.exp(-(cal.a * l + cal.c)));
  return { home: h, draw: 0, away: 1 - h };
}

function metrics(samples: Sample[], cal: { a: number; c: number } | null, league: string) {
  let hit = 0, brier = 0, ll = 0;
  let spN = 0, spHit = 0;
  const thr = strongPickThreshold(league);
  for (const s of samples) {
    const p = withPlatt(s.raw, cal);
    const pick = p.home >= p.away && p.home >= p.draw ? "H" : p.away >= p.draw ? "A" : "D";
    if (pick === s.res) hit++;
    const act = { H: [1, 0, 0], D: [0, 1, 0], A: [0, 0, 1] }[s.res];
    const pv = [p.home, p.draw, p.away];
    for (let k = 0; k < 3; k++) brier += (pv[k] - act[k]) ** 2;
    ll += -Math.log(Math.max(1e-6, s.res === "H" ? p.home : s.res === "D" ? p.draw : p.away));
    const top = Math.max(...pv);
    if (top >= thr) {
      spN++;
      if (pick === s.res) spHit++;
    }
  }
  const n = samples.length || 1;
  return {
    n: samples.length,
    acc: hit / n,
    brier: brier / n,
    ll: ll / n,
    spN,
    spAcc: spN ? spHit / spN : 0,
  };
}

/** Platt(a,c) 그리드 재적합 — 주어진 표본의 log loss 최소화. */
function fitPlatt(samples: Sample[]) {
  let best = { a: 1, c: 0, ll: Infinity };
  for (let a = 0.1; a <= 1.31; a += 0.05) {
    for (let c = -0.4; c <= 0.201; c += 0.025) {
      let ll = 0;
      for (const s of samples) {
        if (s.res === "D") continue;
        const p = withPlatt(s.raw, { a, c });
        ll += -Math.log(Math.max(1e-6, s.res === "H" ? p.home : p.away));
      }
      if (ll < best.ll) best = { a: +a.toFixed(3), c: +c.toFixed(3), ll };
    }
  }
  return best;
}

const pct = (x: number) => (x * 100).toFixed(1) + "%";

async function main() {
  console.log(`# 홈 어드밴티지 백테스트 (elo.ts HA = ${ELO_HA})\n`);

  for (const lg of LEAGUES) {
    const byHa = await collect(lg);
    const cal = hasHomeCalibration(lg)
      ? // home-calibration 의 실제 계수를 함수로 역추출 (상수 export 가 없어서)
        (() => {
          // sigmoid(a·logit(p)+c) 를 두 점에서 풀면 a,c 가 나온다
          const f = (p: number) => {
            const q = calibrateHomeWinProb(p, lg);
            return Math.log(q / (1 - q));
          };
          const l1 = Math.log(0.6 / 0.4), l2 = Math.log(0.4 / 0.6);
          const a = (f(0.6) - f(0.4)) / (l1 - l2);
          const c = f(0.6) - a * l1;
          return { a: +a.toFixed(4), c: +c.toFixed(4) };
        })()
      : null;

    const base = byHa.get(100)!;
    const n0 = base.length;
    const hwr = base.filter((s) => s.res === "H").length / (n0 || 1);
    console.log(
      `\n## ${lg} — n=${n0} · 실제 홈승률 ${pct(hwr)}` +
      `${cal ? `  Platt a=${cal.a} c=${cal.c}` : "  Platt 없음"}`,
    );
    console.log("  HA    적중률    Brier    logloss   Strong(n/적중)   Brier전반/후반");
    const half = Math.floor(n0 / 2);
    for (const ha of HA_VALUES) {
      const s = byHa.get(ha)!;
      const m = metrics(s, cal, lg);
      // 반분할 — 단일 파라미터라도 전·후반 양쪽에서 이겨야 채택한다
      const b1 = metrics(s.slice(0, half), cal, lg).brier;
      const b2 = metrics(s.slice(half), cal, lg).brier;
      console.log(
        `  ${String(ha).padStart(3)}   ${pct(m.acc).padStart(6)}  ${m.brier.toFixed(4)}  ` +
        `${m.ll.toFixed(4)}   ${String(m.spN).padStart(4)} / ${pct(m.spAcc).padStart(6)}   ` +
        `${b1.toFixed(4)} / ${b2.toFixed(4)}`,
      );
    }

    // ── Platt 재적합 out-of-sample (전반 60% fit → 후반 40% test) ──
    const all = byHa.get(100)!;
    const cut = Math.floor(all.length * 0.6);
    if (all.length >= 200) {
      console.log("  [Platt 재적합 out-of-sample — 전반 60% fit / 후반 40% test]");
      console.log("  HA    fit(a,c)         test 적중률  test Brier   (현행계수 test Brier)");
      for (const ha of HA_VALUES) {
        const s = byHa.get(ha)!;
        const fit = fitPlatt(s.slice(0, cut));
        const test = s.slice(cut);
        const mFit = metrics(test, { a: fit.a, c: fit.c }, lg);
        const mCur = metrics(test, cal, lg);
        console.log(
          `  ${String(ha).padStart(3)}   a=${fit.a.toFixed(2)} c=${fit.c.toFixed(3).padStart(6)}   ` +
          `${pct(mFit.acc).padStart(6)}      ${mFit.brier.toFixed(4)}       ${mCur.brier.toFixed(4)}`,
        );
      }
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
