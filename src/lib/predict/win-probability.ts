// Elo 기반 승률 추정.
// 단순 휴리스틱이지만 직관적인 결과를 낸다.
//
// - 두 팀 Elo 차이 + 홈 어드밴티지(100점) 로 기댓값 계산
// - 무승부 확률은 두 팀 실력이 비슷할수록 커지는 형태로 보정
// - 야구·농구는 정규시간 무승부가 거의 없으므로 drawWeight 0 으로

const HOME_ADVANTAGE_ELO = 100;

export interface WinProbConfig {
  /** 무승부 비중 (0=무승부 없음, 0.30=축구 일반) */
  drawWeight?: number;
  /** 두 팀 실력이 비슷할수록 무승부 확률을 얼마나 더할지 */
  drawSensitivity?: number;
}

export interface WinProb {
  home: number; // 0~1
  draw: number; // 0~1
  away: number; // 0~1
}

const SOCCER_DRAW = { drawWeight: 0.18, drawSensitivity: 0.18 };
const NO_DRAW = { drawWeight: 0, drawSensitivity: 0 };

const DEFAULT_CONFIG: Record<string, WinProbConfig> = {
  // 축구
  EPL: SOCCER_DRAW,
  LALIGA: SOCCER_DRAW,
  BUNDESLIGA: SOCCER_DRAW,
  SERIE_A: SOCCER_DRAW,
  LIGUE_1: SOCCER_DRAW,
  MLS: SOCCER_DRAW,
  UCL: SOCCER_DRAW,
  // 농구·야구·하키
  NBA: NO_DRAW,
  NHL: NO_DRAW,
  MLB: NO_DRAW,
  KBO: NO_DRAW,
};

export function calcWinProbability(
  eloHome: number,
  eloAway: number,
  league: string,
): WinProb {
  const cfg = DEFAULT_CONFIG[league] ?? DEFAULT_CONFIG.EPL;

  const diff = eloAway - (eloHome + HOME_ADVANTAGE_ELO);
  // expHome = "홈이 이길 (또는 비겼을 때 절반의 무승부 점수를 가져갈) 기댓값"
  const expHome = 1 / (1 + Math.pow(10, diff / 400));

  // 두 팀이 비슷할수록 (expHome 이 0.5 에 가까울수록) 무승부 확률 증가
  const closeness = 1 - Math.abs(expHome - 0.5) * 2; // 0~1
  const drawProb =
    (cfg.drawWeight ?? 0) + closeness * (cfg.drawSensitivity ?? 0);

  const remaining = 1 - drawProb;
  const homeProb = expHome * remaining;
  const awayProb = (1 - expHome) * remaining;

  return {
    home: clamp01(homeProb),
    draw: clamp01(drawProb),
    away: clamp01(awayProb),
  };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

/** 사람이 읽을 수 있는 한 줄 요약 ("Liverpool 우세 38%" 같은 형태) */
export function summarizeWinProb(
  prob: WinProb,
  homeName: string,
  awayName: string,
): string {
  const max = Math.max(prob.home, prob.draw, prob.away);
  const pct = (n: number) => Math.round(n * 100);
  if (max === prob.home) return `${homeName} 우세 ${pct(prob.home)}%`;
  if (max === prob.away) return `${awayName} 우세 ${pct(prob.away)}%`;
  return `무승부 가능성 우세 ${pct(prob.draw)}%`;
}
