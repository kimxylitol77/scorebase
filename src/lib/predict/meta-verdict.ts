// 두 독립 AI 픽(우리 모델·GPT) + 시장을 규칙으로 종합해 최종판단(신뢰도등급·추천상태·시장괴리)을 낸다.
// 어느 모델의 확률도 덮어쓰지 않는 메타층 — 성적표 독립성·백테스트 calibration 불가침. LLM 호출 없음.

export type Winner = "HOME" | "DRAW" | "AWAY";
export type Grade = "A" | "B" | "C" | "D";
export type Status = "추천" | "조건부 추천" | "정보 확인 필요" | "패스";

export interface MetaModelPick {
  pick: Winner;
  prob: number; // 0~1
}
export interface MetaMarket {
  home: number; // 함축확률 0~1
  draw: number | null;
  away: number;
}
export interface MetaVerdictInput {
  sb: MetaModelPick;
  gpt: MetaModelPick;
  market: MetaMarket | null;
  homeKo: string;
  awayKo: string;
  allowDraw: boolean;
}
export interface MetaVerdict {
  agreement: "일치" | "갈림";
  consensusPick: Winner;
  consensusProb: number; // 합의 픽의 두 모델 평균확률(일치) 또는 tiebreak 픽 확률(갈림)
  marketState: "일치" | "괴리" | "미수집";
  marketProb: number | null; // consensusPick 의 시장 함축확률
  edgePp: number | null; // consensusProb - marketProb, 퍼센트포인트(양수=모델이 시장보다 높게 봄)
  grade: Grade;
  status: Status;
  line: string; // 한줄 종합
}

function label(pick: Winner, homeKo: string, awayKo: string): string {
  return pick === "HOME" ? homeKo : pick === "AWAY" ? awayKo : "무승부";
}

function marketFavorite(market: MetaMarket, allowDraw: boolean): Winner {
  const entries: [Winner, number][] = [
    ["HOME", market.home],
    ["AWAY", market.away],
  ];
  if (allowDraw && market.draw != null) entries.push(["DRAW", market.draw]);
  return entries.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

function marketProbFor(pick: Winner, market: MetaMarket): number | null {
  if (pick === "HOME") return market.home;
  if (pick === "AWAY") return market.away;
  return market.draw;
}

const STATUS_BY_GRADE: Record<Grade, Status> = {
  A: "추천",
  B: "조건부 추천",
  C: "정보 확인 필요",
  D: "패스",
};

export function computeMetaVerdict(input: MetaVerdictInput): MetaVerdict {
  const { sb, gpt, market, homeKo, awayKo, allowDraw } = input;
  const agree = sb.pick === gpt.pick;

  let consensusPick: Winner;
  let consensusProb: number;
  if (agree) {
    consensusPick = sb.pick;
    consensusProb = (sb.prob + gpt.prob) / 2;
  } else if (market) {
    // 갈림 — 시장을 tiebreak
    consensusPick = marketFavorite(market, allowDraw);
    consensusProb =
      consensusPick === sb.pick
        ? sb.prob
        : consensusPick === gpt.pick
          ? gpt.prob
          : Math.max(sb.prob, gpt.prob);
  } else {
    // 갈림 + 시장 없음 — 확률 높은 쪽
    const stronger = sb.prob >= gpt.prob ? sb : gpt;
    consensusPick = stronger.pick;
    consensusProb = stronger.prob;
  }

  let marketState: MetaVerdict["marketState"];
  let marketProb: number | null = null;
  let edgePp: number | null = null;
  if (!market) {
    marketState = "미수집";
  } else {
    marketProb = marketProbFor(consensusPick, market);
    marketState = marketFavorite(market, allowDraw) === consensusPick ? "일치" : "괴리";
    if (marketProb != null) edgePp = Math.round((consensusProb - marketProb) * 100);
  }

  let grade: Grade;
  if (agree) {
    if (marketState === "일치") grade = consensusProb >= 0.6 ? "A" : "B";
    else if (marketState === "미수집") grade = consensusProb >= 0.6 ? "B" : "C";
    else grade = "C"; // 괴리
  } else {
    grade = marketState === "일치" ? "C" : "D";
  }

  const teamLabel = label(consensusPick, homeKo, awayKo);
  let line: string;
  if (grade === "A") {
    line = `${teamLabel} 우세 — 두 모델과 시장이 모두 같은 방향, 신뢰도 높은 픽.`;
  } else if (agree && marketState === "미수집") {
    line = `${teamLabel} 우세(두 모델 일치)이나 배당 미수집으로 조건부.`;
  } else if (agree && marketState === "일치") {
    line = `${teamLabel} 우세하나 확률 여유가 크지 않아 조건부.`;
  } else if (agree && marketState === "괴리") {
    const favLabel = label(marketFavorite(market!, allowDraw), homeKo, awayKo);
    line = `모델은 ${teamLabel} 우세이나 시장은 ${favLabel} 지지 — 확인 필요.`;
  } else if (!agree && marketState === "일치") {
    line = `두 모델 의견이 갈렸고 시장은 ${teamLabel} — 확인 필요.`;
  } else {
    line = `두 모델 의견이 갈려 픽을 보류(패스).`;
  }

  return {
    agreement: agree ? "일치" : "갈림",
    consensusPick,
    consensusProb,
    marketState,
    marketProb,
    edgePp,
    grade,
    status: STATUS_BY_GRADE[grade],
    line,
  };
}
