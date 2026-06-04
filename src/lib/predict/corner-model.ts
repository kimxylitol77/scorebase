// src/lib/predict/corner-model.ts
// 축구 코너 예측 — MatchStats(코너 데이터)로 팀별 코너 공/수 강도(홈/원정·시간감쇠·shrinkage)를
// 추정 → 기대 코너 λ → Poisson 으로 총 코너 기대값 + 오버언더 확률.
//
// 구조는 dixon-coles.ts 와 동일(비율 추정). 단 득점→코너, τ 저점수 보정은 생략(코너는 독립 근사 OK).
// 데이터: MatchStats(homeCorners/awayCorners) + Match(homeTeamId/awayTeamId/startTime).
//
// ⚠️ 백테스트 결과 (2026-06-04, 메이저 5리그 464경기 holdout): **나이브 baseline(리그평균) 을
//    못 이김** — MAE 모델 3.10 vs 나이브 3.02, 오버9.5 적중 54.7%. 코너는 노이즈가 커서
//    팀-Poisson 이 평균 대비 가치 없음. → **프로덕션/UI 미배선**(DC 와 같은 규율: 백테스트 통과만 채택).
//    더 나은 피처(슛·점유율·심판 성향 등) 확보 시 재시도용으로 코드 보존.

export interface CornerMatch {
  homeTeamId: number;
  awayTeamId: number;
  homeCorners: number;
  awayCorners: number;
  startTime: Date;
}

export interface CornerPrediction {
  lambdaHome: number; // 홈 기대 코너
  lambdaAway: number; // 원정 기대 코너
  expTotal: number; // 총 기대 코너
  over: { line: number; prob: number }[]; // 라인별 오버 확률
  /** 학습 표본 — 적으면 신뢰도 낮음(표시 게이트용). */
  sampleHome: number;
  sampleAway: number;
}

const HALF_LIFE_DAYS = 180; // 코너는 득점보다 안정적 → 더 긴 반감기
const DECAY = Math.log(2) / HALF_LIFE_DAYS;
const PRIOR_K = 4; // shrinkage 의사관측
const LINES = [8.5, 9.5, 10.5, 11.5];

interface Agg {
  homeFor: number;
  homeAgainst: number;
  homeW: number;
  awayFor: number;
  awayAgainst: number;
  awayW: number;
}
interface Strength {
  atkHome: number;
  defHome: number;
  atkAway: number;
  defAway: number;
  nHome: number;
  nAway: number;
}
export interface CornerStrengths {
  muHome: number;
  muAway: number;
  teams: Map<number, Strength>;
}

// Σ_{i=0}^{k} Poisson(i, λ)
function poissonCdf(k: number, lambda: number): number {
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= k; i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

export function fitCornerStrengths(matches: CornerMatch[], refTime: Date): CornerStrengths {
  const ref = refTime.getTime();
  const before = matches.filter((m) => m.startTime.getTime() < ref);
  const w = (m: CornerMatch) => Math.exp((-DECAY * (ref - m.startTime.getTime())) / 86400000);

  let sumH = 0;
  let sumA = 0;
  let sumW = 0;
  for (const m of before) {
    const ww = w(m);
    sumH += ww * m.homeCorners;
    sumA += ww * m.awayCorners;
    sumW += ww;
  }
  const muHome = sumW > 0 ? sumH / sumW : 5.3; // 리그 평균 홈/원정 코너
  const muAway = sumW > 0 ? sumA / sumW : 4.5;

  const agg = new Map<number, Agg>();
  const get = (id: number): Agg => {
    let a = agg.get(id);
    if (!a) {
      a = { homeFor: 0, homeAgainst: 0, homeW: 0, awayFor: 0, awayAgainst: 0, awayW: 0 };
      agg.set(id, a);
    }
    return a;
  };
  for (const m of before) {
    const ww = w(m);
    const h = get(m.homeTeamId);
    const a = get(m.awayTeamId);
    h.homeFor += ww * m.homeCorners;
    h.homeAgainst += ww * m.awayCorners;
    h.homeW += ww;
    a.awayFor += ww * m.awayCorners;
    a.awayAgainst += ww * m.homeCorners;
    a.awayW += ww;
  }

  const ratio = (sum: number, wsum: number, mu: number) =>
    (sum + PRIOR_K * mu) / (wsum + PRIOR_K) / mu;
  const teams = new Map<number, Strength>();
  for (const [id, a] of agg) {
    teams.set(id, {
      atkHome: ratio(a.homeFor, a.homeW, muHome),
      defHome: ratio(a.homeAgainst, a.homeW, muAway),
      atkAway: ratio(a.awayFor, a.awayW, muAway),
      defAway: ratio(a.awayAgainst, a.awayW, muHome),
      nHome: a.homeW,
      nAway: a.awayW,
    });
  }
  return { muHome, muAway, teams };
}

const DEFAULT_TEAM: Strength = {
  atkHome: 1,
  defHome: 1,
  atkAway: 1,
  defAway: 1,
  nHome: 0,
  nAway: 0,
};

export function predictCorners(
  s: CornerStrengths,
  homeId: number,
  awayId: number,
): CornerPrediction {
  const H = s.teams.get(homeId) ?? DEFAULT_TEAM;
  const A = s.teams.get(awayId) ?? DEFAULT_TEAM;
  let lh = H.atkHome * A.defAway * s.muHome;
  let la = A.atkAway * H.defHome * s.muAway;
  lh = Math.max(1, Math.min(12, lh));
  la = Math.max(1, Math.min(12, la));
  const lt = lh + la;
  const over = LINES.map((line) => ({
    line,
    prob: 1 - poissonCdf(Math.floor(line), lt),
  }));
  return {
    lambdaHome: lh,
    lambdaAway: la,
    expTotal: lt,
    over,
    sampleHome: H.nHome,
    sampleAway: A.nAway,
  };
}
