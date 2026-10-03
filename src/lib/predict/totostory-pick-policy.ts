export const TOTOSTORY_PICK_POLICY_VERSION = "2026-10-03-market-quality-v2";
export const SEVERE_PICK_UNCERTAINTY_RE = /미발표|미정|불확실|확정되지|정보 부족|선발.*없|라인업.*없/i;

export function hasVerifiedPickMarket(input: {
  comparable: boolean;
  odds: number | null;
  bookmakers: number | null;
  updatedAt: Date | null;
  now: Date;
}) {
  const age = input.updatedAt ? input.now.getTime() - input.updatedAt.getTime() : NaN;
  return input.comparable
    && input.odds != null && Number.isFinite(input.odds) && input.odds >= 1.45
    && input.bookmakers != null && Number.isFinite(input.bookmakers) && input.bookmakers >= 3
    && Number.isFinite(age) && age >= 0 && age <= 48 * 60 * 60 * 1000;
}

// Market type and decimal odds do not earn ranking bonuses.
export function compareTotoStoryCandidates(
  a: { confidenceScore: number; startTime: string; matchId: number; market: string },
  b: { confidenceScore: number; startTime: string; matchId: number; market: string },
) {
  return b.confidenceScore - a.confidenceScore
    || a.startTime.localeCompare(b.startTime)
    || a.matchId - b.matchId
    || a.market.localeCompare(b.market);
}
