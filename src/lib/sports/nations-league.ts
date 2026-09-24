// UEFA 네이션스리그 허브용 순수 규칙 — 라운드 해석·빅매치 선정·확정 구역·한국시간 표기.
// prisma 를 들이지 않는다(테스트가 DB 없이 돌아야 한다). 데이터 조회는 NationsLeagueHub 가 한다.
// 빅매치 선정·KST 표기는 tournament-hub 공용 규칙을 쓴다(AFCON 허브와 같은 규칙).
import { kstKickoff, pickSpotlight, type HubMatchLite } from "./tournament-hub";

export type NlTier = "A" | "B" | "C" | "D";
export const NL_TIERS: readonly NlTier[] = ["A", "B", "C", "D"];
/** 리그페이즈 라운드 수 — 4팀 조 더블 라운드로빈(6경기). 3팀 조(리그 D)도 같은 달력을 쓴다. */
export const NL_MATCHDAYS = 6;

/**
 * 조별 순위에서 확정된 규칙만 — 2026-27 대회 규정(UEFA 공식).
 * 하위권 강등·승강 플레이오프는 조끼리 성적을 비교해 정해지므로(리그 A 3위 중 하위 2팀 등)
 * 행 단위로 칠하면 틀린 표시가 된다. 여기엔 순위만으로 확정되는 것만 둔다.
 */
export const NL_TIER_RULE: Record<NlTier, { advanceUpTo: number; zone: "qf" | "promo"; label: string }> = {
  A: { advanceUpTo: 2, zone: "qf", label: "조 1·2위 8강 진출 (2027년 3월)" },
  B: { advanceUpTo: 1, zone: "promo", label: "조 1위 리그 A 승격" },
  C: { advanceUpTo: 1, zone: "promo", label: "조 1위 리그 B 승격" },
  D: { advanceUpTo: 1, zone: "promo", label: "조 1위 리그 C 승격" },
};

/** af 경기 raw 의 round("League A - 3") → 등급·라운드. 네이션스리그 형식이 아니면 null. */
export function parseNlRound(raw: string | null | undefined): { tier: NlTier; matchday: number } | null {
  if (!raw) return null;
  const m = raw.match(/"round"\s*:\s*"League\s+([A-D])\s*-\s*(\d+)"/i);
  if (!m) return null;
  const matchday = Number(m[2]);
  if (!Number.isInteger(matchday) || matchday < 1) return null;
  return { tier: m[1].toUpperCase() as NlTier, matchday };
}

/** af 조 원문("UEFA Nations League , League A, Group 1") → 등급·조 번호. */
export function parseNlGroup(rawGroup: string): { tier: NlTier; group: number } | null {
  const t = rawGroup.match(/League\s+([A-D])\b/i);
  const g = rawGroup.match(/Group\s+(\d+)/i);
  if (!t || !g) return null;
  return { tier: t[1].toUpperCase() as NlTier, group: Number(g[1]) };
}

/** 이 순위가 확정 구역(8강·승격)인가. 조에서 한 경기라도 치러지기 전엔 순서가 임의라 칠하지 않는다. */
export function nlZone(tier: NlTier, position: number, groupPlayed: boolean): "qf" | "promo" | null {
  if (!groupPlayed) return null;
  const rule = NL_TIER_RULE[tier];
  return position <= rule.advanceUpTo ? rule.zone : null;
}

export interface NlMatchLite extends HubMatchLite {
  tier: NlTier;
}

/** 빅매치 — 리그 A 경기 중에서 공용 규칙(pickSpotlight)으로 고른다. */
export function pickFeatured<T extends NlMatchLite>(matches: T[]): T | null {
  return pickSpotlight(matches.filter((m) => m.tier === "A"));
}

export { kstKickoff };
