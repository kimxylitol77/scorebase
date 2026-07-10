// 전술 분석 아티클 데이터 게이트 — 포메이션 + xG 가 모두 있는 경기만 통과시킨다.
// 데이터 없는 경기에 LLM 일반론글을 만들면 thin content 로 SEO 역효과이므로,
// 생성 큐잉 전에 여기서 걸러낸다. (Post-match 전술 리뷰 기준)

/** 게이트가 검사하는 최소 필드 — Match 에서 select 해 넘긴다. */
export interface TacticalGateInput {
  status: string;
  lineupHome: string | null;
  lineupAway: string | null;
  fixtureStats: string | null;
}

/** 라인업 JSON 에서 포메이션 문자열 추출. 없거나 파싱 실패 시 null. */
export function parseFormation(lineupJson: string | null): string | null {
  if (!lineupJson) return null;
  try {
    const parsed = JSON.parse(lineupJson) as { formation?: string | null };
    const f = parsed.formation?.trim();
    return f ? f : null;
  } catch {
    return null;
  }
}

/** fixtureStats JSON([home, away]) 에서 양팀 xG 추출. 없으면 null. */
export function parseXg(fixtureStats: string | null): {
  home: number | null;
  away: number | null;
} {
  if (!fixtureStats) return { home: null, away: null };
  try {
    const fs = JSON.parse(fixtureStats) as { expectedGoals?: number | null }[];
    if (Array.isArray(fs) && fs.length === 2) {
      return {
        home: fs[0]?.expectedGoals ?? null,
        away: fs[1]?.expectedGoals ?? null,
      };
    }
  } catch {
    // 손상 JSON — xG 없음 처리
  }
  return { home: null, away: null };
}

/** 게이트 탈락 사유(로그·디버깅용). 통과 시 null. */
export function tacticalGateReason(m: TacticalGateInput): string | null {
  if (m.status !== "FINISHED") return "미종료(Post-match 대상 아님)";
  if (!parseFormation(m.lineupHome) || !parseFormation(m.lineupAway))
    return "포메이션 없음";
  const xg = parseXg(m.fixtureStats);
  if (xg.home == null || xg.away == null) return "xG 없음";
  return null;
}

/**
 * 전술 분석 생성 가능 여부 — 경기가 종료됐고, 양팀 포메이션과 xG 가 모두 있을 때만 true.
 * 매치스탯(점유·슈팅)은 선택 항목이라 게이트에 넣지 않는다(컨텍스트에서 있으면 주입).
 */
export function hasTacticalData(m: TacticalGateInput): boolean {
  return tacticalGateReason(m) === null;
}
