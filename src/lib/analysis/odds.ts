// 픽한 선택지에 해당하는 시장 배당(The Odds API) 추출 + 포맷.
// 분석 목록(page)·상세([id]/page)에서 공유. 순수 함수라 server/client 무관.

export const fmtOdds = (n: number) => n.toFixed(2);

export interface OddsFields {
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
  oddsHcHome: number | null;
  oddsHcAway: number | null;
  oddsOver: number | null;
  oddsUnder: number | null;
}

/** (market, pick) → 해당 배당값. 배당 없거나 픽 없으면 null. */
export function pickOdds(
  market: string | null,
  pick: string | null,
  m: OddsFields | null,
): number | null {
  if (!m || !market || !pick) return null;
  if (market === "1X2")
    return pick === "HOME" ? m.oddsHome : pick === "DRAW" ? m.oddsDraw : pick === "AWAY" ? m.oddsAway : null;
  if (market === "HANDICAP")
    return pick === "HOME" ? m.oddsHcHome : pick === "AWAY" ? m.oddsHcAway : null;
  if (market === "OU")
    return pick === "OVER" ? m.oddsOver : pick === "UNDER" ? m.oddsUnder : null;
  return null;
}
