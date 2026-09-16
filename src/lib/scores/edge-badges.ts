// /scores 경기 카드의 "요소 우세" 칩 — 목록 렌더에 이미 실린 필드(선발 JSON·불펜 JSON·골리 JSON·모델/시장 확률·순위)만으로
// 어느 팀이 어떤 요소에서 앞서는지 짧은 배지로 만든다. 추가 조회 없음, 순수함수.

export type EdgeSide = "home" | "away";
export type EdgeKey = "starter" | "bullpen" | "goalie" | "model" | "rank";

export interface EdgeBadge {
  key: EdgeKey;
  side: EdgeSide;
  /** 칩 글자 — "선발 우세" 처럼 짧게 */
  label: string;
  /** hover 설명 — 판정 근거 수치 */
  title: string;
}

export const EDGE_LABEL: Record<EdgeKey, string> = {
  starter: "선발 우세",
  bullpen: "불펜 여유",
  goalie: "골리 우세",
  model: "모델 우위",
  rank: "순위 우세",
};

/** 판정 임계 — 근소한 차이는 칩을 달지 않는다(칩이 많으면 신호가 아니다). */
export const EDGE_THRESHOLDS = {
  /** 선발 ERA 차이(이상), 두 선발 모두 최소 이닝 */
  starterEraGap: 1.0,
  starterMinIp: 20,
  /** MLB 불펜 3일 누적 투구수 차이(이상) */
  bullpenPitchGap: 60,
  /** NHL 골리 세이브율 차이(이상), 최소 출전 */
  goalieSvGap: 0.01,
  goalieMinGp: 5,
  /** 모델 확률 − 시장 확률(마진 제거) 차이(이상) */
  modelEdge: 0.06,
  /** 순위 차이(이상) */
  rankGap: 8,
} as const;

export const MAX_EDGE_BADGES = 3;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function parseJson(s: string | null | undefined): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** "119.1"(MLB 소수 표기) · "66 2/3"(KBO) · "5" → 대략 이닝 수(정수부만 써도 임계 판정엔 충분) */
export function roughInnings(ip: unknown): number | null {
  if (typeof ip === "number") return ip;
  if (typeof ip !== "string") return null;
  const m = ip.trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

export interface EdgeInput {
  status: string;
  /** 야구 선발 JSON 문자열(Match.homeStarter) */
  homeStarter?: string | null;
  awayStarter?: string | null;
  /** MLB 불펜 3일 집계 JSON(Match.homeBullpen) */
  homeBullpen?: string | null;
  awayBullpen?: string | null;
  /** NHL 골리 JSON(Match.homeGoalie) */
  homeGoalie?: string | null;
  awayGoalie?: string | null;
  predHome?: number | null;
  predAway?: number | null;
  /** 마진 제거 시장 확률(Match.marketHome) */
  marketHome?: number | null;
  marketAway?: number | null;
}

/** 예정·진행 중 경기만. 종료 경기는 결과가 있어 칩이 소음이다. */
export function computeEdgeBadges(m: EdgeInput): EdgeBadge[] {
  if (m.status !== "SCHEDULED" && m.status !== "LIVE") return [];
  const out: EdgeBadge[] = [];
  const T = EDGE_THRESHOLDS;

  // 선발 — ERA 가 낮은 쪽. 표본 없는 선발(이닝 부족)은 판정하지 않는다.
  const hs = parseJson(m.homeStarter);
  const as = parseJson(m.awayStarter);
  if (hs && as) {
    const hEra = num(hs.era), aEra = num(as.era);
    const hIp = roughInnings(hs.ip), aIp = roughInnings(as.ip);
    if (hEra != null && aEra != null && hIp != null && aIp != null && hIp >= T.starterMinIp && aIp >= T.starterMinIp && Math.abs(hEra - aEra) >= T.starterEraGap) {
      const side: EdgeSide = hEra < aEra ? "home" : "away";
      out.push({ key: "starter", side, label: EDGE_LABEL.starter, title: `선발 ERA ${hEra.toFixed(2)} vs ${aEra.toFixed(2)}` });
    }
  }

  // 불펜 — 최근 3일 투구수가 적은 쪽이 여유.
  const hb = parseJson(m.homeBullpen);
  const ab = parseJson(m.awayBullpen);
  if (hb && ab) {
    const hp = num(hb.pitches3d), ap = num(ab.pitches3d);
    if (hp != null && ap != null && Math.abs(hp - ap) >= T.bullpenPitchGap) {
      const side: EdgeSide = hp < ap ? "home" : "away";
      out.push({ key: "bullpen", side, label: EDGE_LABEL.bullpen, title: `최근 3일 불펜 투구수 ${hp} vs ${ap}` });
    }
  }

  // 골리 — 세이브율이 높은 쪽.
  const hg = parseJson(m.homeGoalie);
  const ag = parseJson(m.awayGoalie);
  if (hg && ag) {
    const hs2 = num(hg.savePctg), as2 = num(ag.savePctg);
    const hgp = num(hg.gamesPlayed) ?? 0, agp = num(ag.gamesPlayed) ?? 0;
    if (hs2 != null && as2 != null && hgp >= T.goalieMinGp && agp >= T.goalieMinGp && Math.abs(hs2 - as2) >= T.goalieSvGap) {
      const side: EdgeSide = hs2 > as2 ? "home" : "away";
      out.push({ key: "goalie", side, label: EDGE_LABEL.goalie, title: `골리 세이브율 ${(hs2 * 100).toFixed(1)}% vs ${(as2 * 100).toFixed(1)}%` });
    }
  }

  // 모델 vs 시장 — 우리 모델이 시장보다 한쪽을 뚜렷이 높게 볼 때.
  const ph = num(m.predHome), pa = num(m.predAway), mh = num(m.marketHome), ma = num(m.marketAway);
  if (ph != null && pa != null && mh != null && ma != null) {
    const eh = ph - mh, ea = pa - ma;
    if (Math.max(eh, ea) >= T.modelEdge) {
      const side: EdgeSide = eh >= ea ? "home" : "away";
      const e = side === "home" ? eh : ea;
      const model = side === "home" ? ph : pa;
      const market = side === "home" ? mh : ma;
      out.push({ key: "model", side, label: EDGE_LABEL.model, title: `모델 ${(model * 100).toFixed(0)}% vs 시장 ${(market * 100).toFixed(0)}% (+${(e * 100).toFixed(0)}%p)` });
    }
  }

  return out.slice(0, MAX_EDGE_BADGES);
}

/** 순위 칩 — 순위는 컴포넌트 렌더 시점에 붙으므로 따로 계산. 예정·진행 중에서만 쓴다. */
export function rankBadge(homePos: number | null | undefined, awayPos: number | null | undefined): EdgeBadge | null {
  if (homePos == null || awayPos == null) return null;
  if (Math.abs(homePos - awayPos) < EDGE_THRESHOLDS.rankGap) return null;
  const side: EdgeSide = homePos < awayPos ? "home" : "away";
  return { key: "rank", side, label: EDGE_LABEL.rank, title: `리그 순위 ${homePos}위 vs ${awayPos}위` };
}
