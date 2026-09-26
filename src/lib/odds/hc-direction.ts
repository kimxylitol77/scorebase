// 시장 핸디캡의 방향 판정 — Match.oddsHcLine 은 절댓값만 저장돼 어느 팀이 핸디를 주는지 모른다.
// 우리 모델·투표·봇 픽의 핸디는 전부 "홈 −기준선"(HOME=홈이 기준선 넘게 이김) 규칙이라, 시장도 홈이
// 같은 기준선으로 핸디를 줄 때만 oddsHcHome/Away 가 같은 내기의 배당이다. 원정이 핸디를 주는 경기에
// 그대로 붙이면 반대편 내기의 배당이 저장돼 수익률·CLV 가 틀린다(2026-09-26 발견).

export interface HcMarketSource {
  oddsHcLine: number | null;
  /** Match.oddsBookmakers — books[].hl = 업체별 홈 핸디 기준선(부호 포함, The Odds API) */
  oddsBookmakers: unknown;
  oddsHome: number | null;
  oddsAway: number | null;
}

/**
 * 시장 홈 핸디 기준선(부호 포함, 예 −1.5 = 홈이 1.5 핸디를 준다). 모르면 null.
 * 1순위 업체별 배당(books[].hl)에서 그 기준선을 쓴 업체들의 다수결.
 * 2순위 업체별 배당이 없는 소스(TheSports 야구 등) — 승부 배당이 낮은 쪽(강팀)이 핸디를 준다.
 */
export function marketHomeHcPoint(m: HcMarketSource): number | null {
  if (m.oddsHcLine == null || m.oddsHcLine === 0) return null;
  const abs = Math.abs(m.oddsHcLine);
  const books = (m.oddsBookmakers as { books?: Array<{ hl?: unknown }> } | null)?.books;
  if (Array.isArray(books)) {
    let fav = 0;
    let dog = 0;
    for (const b of books) {
      if (typeof b?.hl !== "number" || Math.abs(b.hl) !== abs) continue;
      if (b.hl < 0) fav++;
      else if (b.hl > 0) dog++;
    }
    if (fav !== dog) return fav > dog ? -abs : abs;
  }
  if (m.oddsHome != null && m.oddsAway != null && m.oddsHome !== m.oddsAway) {
    return m.oddsHome < m.oddsAway ? -abs : abs;
  }
  return null;
}

/**
 * "홈 −line" 핸디 픽에 붙일 시장 배당. 시장 기준선이 같고 홈이 핸디를 줄 때만, 아니면 null(다른 내기).
 */
export function homeGivesLineOdds(
  m: HcMarketSource & { oddsHcHome: number | null; oddsHcAway: number | null },
  line: number | null,
  pick: "HOME" | "AWAY",
): number | null {
  if (line == null || line <= 0 || m.oddsHcLine == null || Math.abs(m.oddsHcLine) !== line) return null;
  if (marketHomeHcPoint(m) !== -line) return null;
  return pick === "HOME" ? m.oddsHcHome : m.oddsHcAway;
}
