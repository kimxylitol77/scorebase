// 야구 라이브 WPA (Win Probability Added) 곡선.
// 매 이닝 종료 시점의 누적 점수 + 남은 이닝 수 기반으로 home 승률 계산.
// 두 팀 남은 이닝 득점 ~ Poisson(λ * 남은 이닝). 차이 = Skellam.
//
// 정확도보다 시각화 용도 — Monte Carlo 1000 회 시뮬 (충분).
// 무승부는 확률 50/50 분배 (정규시즌 가정).

export interface WpaPoint {
  /** 0 = 경기 시작 전, 1..N = 그 이닝 종료 시점 */
  inning: number;
  /** 0~1. 0.5 = 동률 */
  homeWP: number;
  /** 그 시점 누적 점수 — UI hover 용 */
  homeScore: number;
  awayScore: number;
}

interface ComputeOpts {
  /** 정규 게임 이닝 (기본 9, KBO/NPB/MLB 동일) */
  totalInnings?: number;
  /** 한 이닝 평균 득점 (KBO ~0.53, NPB ~0.44, MLB ~0.49). 기본 0.5. */
  lambdaPerInning?: number;
  /** Monte Carlo 시뮬 횟수. 기본 1500. */
  trials?: number;
}

/**
 * @param awayInnings 1~N 이닝의 점수 (null = 아직 미진행)
 * @param homeInnings 동일
 */
export function computeBaseballWpa(
  awayInnings: (number | null)[],
  homeInnings: (number | null)[],
  opts: ComputeOpts = {},
): WpaPoint[] {
  const totalInnings = opts.totalInnings ?? 9;
  const lambda = opts.lambdaPerInning ?? 0.5;
  const trials = opts.trials ?? 1500;

  const series: WpaPoint[] = [];
  // 시작점 (이닝 0) — 50/50
  series.push({ inning: 0, homeWP: 0.5, homeScore: 0, awayScore: 0 });

  let awayCum = 0;
  let homeCum = 0;
  // i = 1..totalInnings (양 팀 모두 그 이닝을 끝낸 경우만)
  for (let i = 0; i < totalInnings; i++) {
    const a = awayInnings[i];
    const h = homeInnings[i];
    // 둘 다 null = 미진행, 한쪽만 = 진행 중 (mid-inning) → 종료 시점만 plot
    if (a == null) break;
    awayCum += a;
    if (h == null) {
      // top 종료 후 bottom 진행 전 — series 에 일단 추가 (away 잔여 0 이닝, home 잔여 (rem+0.5))
      // 단순화: top 종료 시점에도 점 찍되, home 의 bottom 우위 (남은 0.5 이닝 더) 고려
      const remaining = totalInnings - (i + 1);
      // home 은 그 이닝 bottom 아직 안 함 → 평균 lambda 만큼 추가 잠재력 + 남은 이닝
      const wp = simulate(
        homeCum,
        awayCum,
        lambda * (remaining + 1), // home 잔여 (this bottom + remaining innings)
        lambda * remaining, // away 잔여 (다음 이닝부터)
        trials,
      );
      series.push({ inning: i + 0.5, homeWP: wp, homeScore: homeCum, awayScore: awayCum });
      break;
    }
    homeCum += h;
    const remaining = totalInnings - (i + 1);
    let wp: number;
    if (remaining === 0) {
      // 9이닝 종료
      if (homeCum > awayCum) wp = 1;
      else if (homeCum < awayCum) wp = 0;
      else wp = 0.5; // 연장 진입 — 50/50
    } else {
      wp = simulate(homeCum, awayCum, lambda * remaining, lambda * remaining, trials);
    }
    series.push({ inning: i + 1, homeWP: wp, homeScore: homeCum, awayScore: awayCum });
  }
  return series;
}

/** Monte Carlo: home 잔여 ~ Pois(λh), away 잔여 ~ Pois(λa). P(home total > away total). */
function simulate(
  homeNow: number,
  awayNow: number,
  lambdaHome: number,
  lambdaAway: number,
  trials: number,
): number {
  let homeWins = 0;
  let ties = 0;
  for (let t = 0; t < trials; t++) {
    const hAdd = samplePoisson(lambdaHome);
    const aAdd = samplePoisson(lambdaAway);
    const h = homeNow + hAdd;
    const a = awayNow + aAdd;
    if (h > a) homeWins++;
    else if (h === a) ties++;
  }
  // 무승부 50/50 분배 (연장 어드밴티지 무시 — 정규시즌 단순화)
  return (homeWins + ties / 2) / trials;
}

function samplePoisson(lambda: number): number {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}
