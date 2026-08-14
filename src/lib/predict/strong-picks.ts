// 고확신 픽 — "모델이 자신 있어 하는 것만" 고르는 단일 기준.
//
// 왜 마켓마다 임계가 다른가. 채점 11,611경기(2025-07 ~ 2026-08) 실측에서 확신도-적중률
//   곡선이 마켓마다 다르게 생겼다. 같은 "65%"라도 핸디캡은 70.5%를 내지만 1X2 는 61.4%다.
//   그래서 **각 마켓이 실측 70% 선을 넘는 지점**을 임계로 잡았다.
//
//   마켓      전부픽   65%+    75%+    80%+    85%+     → 채택
//   더블찬스   72.3%   72.3%   78.7%   85.6%   89.4%    65%+
//   핸디캡     63.8%   70.5%   74.0%   75.0%   78.1%    65%+
//   1X2       53.6%   61.4%   66.9%   71.3%   78.9%    80%+
//   오버언더   56.9%   62.6%   67.0%   70.2%   70.1%    80%+
//   양팀득점   54.8%   55.2%   54.5%   42.9%   38.5%    제외
//
// ⚠️ 양팀득점은 확신도가 **역행**한다 — 임계를 올릴수록 떨어진다. 이 마켓의 확률값은
//   신뢰 신호가 아니므로 넣지 않는다. 되살리려면 먼저 백테스트로 역행이 사라졌는지 볼 것.

export type StrongMarket = "1X2" | "HANDICAP" | "OVER_UNDER" | "DOUBLE_CHANCE";

/** 마켓별 최소 확신도 — 위 표의 근거로 정한 값 */
export const STRONG_THRESHOLD: Record<StrongMarket, number> = {
  DOUBLE_CHANCE: 0.65,
  HANDICAP: 0.65,
  "1X2": 0.8,
  OVER_UNDER: 0.8,
};

/** 화면 표기 */
export const MARKET_LABEL: Record<StrongMarket, string> = {
  "1X2": "승부",
  HANDICAP: "핸디캡",
  OVER_UNDER: "오버언더",
  DOUBLE_CHANCE: "더블찬스",
};

export interface StrongPickSource {
  predHome: number | null;
  predDraw: number | null;
  predAway: number | null;
  predWinner: string | null;
  predHcPick: string | null;
  predHcProb: number | null;
  predHcLine: number | null;
  predOverPick: string | null;
  predOverProb: number | null;
  predDcPick: string | null;
  predDcProb: number | null;
}

export interface StrongPick {
  market: StrongMarket;
  /** 모델이 고른 쪽 — 화면에 그대로 쓸 수 있는 한국어 */
  pick: string;
  /** 그 픽의 확신도 (0~1) */
  prob: number;
  /** 모델이 고른 쪽의 원본 코드 — AI 패널 픽과 방향을 대조할 때 쓴다(화면 표기는 pick) */
  side: string;
  /** 핸디캡 라인 등 부가 정보 */
  detail?: string;
}

const winnerLabel = (w: string, home: string, away: string) =>
  w === "HOME" ? `${home} 승` : w === "AWAY" ? `${away} 승` : "무승부";

const dcLabel = (pick: string, home: string, away: string) =>
  pick === "1X" ? `${home} 승 또는 무승부` : pick === "X2" ? `${away} 승 또는 무승부` : "무승부 제외";

/**
 * 한 경기에서 기준을 넘는 픽만 뽑는다. 없으면 빈 배열.
 * 확신도 내림차순 — 화면에서 가장 자신 있는 것부터 보이게.
 */
export function selectStrongPicks(
  m: StrongPickSource,
  homeName: string,
  awayName: string,
): StrongPick[] {
  const out: StrongPick[] = [];

  const p1 = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
  if (m.predWinner && p1 >= STRONG_THRESHOLD["1X2"]) {
    out.push({ market: "1X2", pick: winnerLabel(m.predWinner, homeName, awayName), prob: p1, side: m.predWinner });
  }

  if (m.predHcPick && m.predHcProb != null && m.predHcProb >= STRONG_THRESHOLD.HANDICAP) {
    const side = m.predHcPick === "HOME" ? homeName : awayName;
    const line = m.predHcLine;
    out.push({
      market: "HANDICAP",
      pick: `${side} 핸디캡`,
      prob: m.predHcProb,
      side: m.predHcPick,
      detail: line != null ? `기준 ${line > 0 ? "+" : ""}${line}` : undefined,
    });
  }

  // OVER 확률이 저장되므로 UNDER 픽의 확신도는 1-p 다
  if (m.predOverPick && m.predOverProb != null) {
    const prob = m.predOverPick === "OVER" ? m.predOverProb : 1 - m.predOverProb;
    if (prob >= STRONG_THRESHOLD.OVER_UNDER) {
      out.push({
        market: "OVER_UNDER",
        pick: m.predOverPick === "OVER" ? "오버" : "언더",
        prob,
        side: m.predOverPick,
      });
    }
  }

  if (m.predDcPick && m.predDcProb != null && m.predDcProb >= STRONG_THRESHOLD.DOUBLE_CHANCE) {
    out.push({
      market: "DOUBLE_CHANCE",
      pick: dcLabel(m.predDcPick, homeName, awayName),
      prob: m.predDcProb,
      side: m.predDcPick,
    });
  }

  return out.sort((a, b) => b.prob - a.prob);
}
