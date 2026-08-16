export type GwakMarket = "1X2" | "HANDICAP";
export type GwakPick = "HOME" | "DRAW" | "AWAY";

export interface GwakPolicyInput {
  market: GwakMarket;
  sport: string;
  league: string;
  pick: GwakPick;
  line: number | null;
  statisticalProb: number;
  contextProb: number;
  hasComparableMarket: boolean;
  selectedOdds: number | null;
  marketPick: GwakPick | null;
  valueEdgePp: number | null;
  movementPp: number | null;
  reason: string | null;
}

const SEVERE_UNCERTAINTY_RE = /미발표|미정|불확실|확정되지|정보 부족|선발.*없|라인업.*없/i;

/** 홈 기준 핸디캡을 선택 팀 기준으로 변환한다. */
export function selectedHandicap(pick: GwakPick, homeLine: number | null): number | null {
  if (homeLine == null || pick === "DRAW") return null;
  return pick === "HOME" ? homeLine : -homeLine;
}

/**
 * 곽씨 초안 게이트.
 * 두 예측의 방향 일치는 호출부에서 보장하고, 여기서는 확률·시장·라인 품질만 판정한다.
 */
export function passesGwakPolicy(input: GwakPolicyInput): boolean {
  if (input.reason && SEVERE_UNCERTAINTY_RE.test(input.reason)) return false;

  if (input.market === "HANDICAP") {
    const selectedLine = selectedHandicap(input.pick, input.line);
    if (selectedLine == null || selectedLine < 0.5) return false;
    if (!input.hasComparableMarket || input.selectedOdds == null) return false;
    if (input.selectedOdds < 1.55 || input.selectedOdds > 2.35) return false;

    const statFloor = input.sport === "baseball" ? 0.56 : 0.55;
    const contextFloor = input.sport === "baseball" ? 0.62 : 0.61;
    return input.statisticalProb >= statFloor && input.contextProb >= contextFloor;
  }

  const basePassed = input.sport === "soccer"
    ? input.statisticalProb >= 0.56 && input.contextProb >= 0.62
    : input.sport === "baseball"
      ? input.statisticalProb >= 0.58 && input.contextProb >= 0.65
      : input.statisticalProb >= 0.65 && input.contextProb >= 0.65;
  if (!basePassed) return false;

  if (!input.hasComparableMarket) {
    return input.sport === "soccer"
      ? input.statisticalProb >= 0.62 && input.contextProb >= 0.72
      : input.statisticalProb >= 0.62 && input.contextProb >= 0.7;
  }
  if (input.selectedOdds == null || input.selectedOdds < 1.45) return false;
  if (input.marketPick !== input.pick && (input.valueEdgePp ?? 0) < 5) return false;
  if ((input.movementPp ?? 0) < -3 && (input.valueEdgePp ?? 0) < 8) return false;
  return true;
}

export function gwakConfidence(statisticalProb: number, contextProb: number, marketProb: number | null): number {
  const weighted = marketProb == null
    ? 0.45 * statisticalProb + 0.55 * contextProb
    : 0.4 * statisticalProb + 0.45 * contextProb + 0.15 * marketProb;
  return Math.max(60, Math.min(88, Math.round(weighted * 100)));
}
