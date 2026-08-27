// api-football transfers 응답의 중복 레코드 정리 — 팀 페이지 "최근 이적" 전용.
//
// af 는 같은 이적 한 건을 **이틀 연속 날짜로 두 번** 준다. 팀 페이지 이적 섹션이
// 같은 선수를 8/13·8/14 로 두 줄 노출하던 원인이다 (2026-08-27 PSG #293 제보 —
// 미카 호츠·페란 토레스가 각각 두 번).
//
// 기존 dedup 키에 date 가 들어 있어 날짜가 다르면 서로 다른 이적으로 읽혔다.
//
// 실측 (2026-08-27, af transfers?team=85 전체 635건):
//   같은 (선수·in·out·유형) 조합의 인접 날짜쌍 — 7일 이내 35쌍 / 7일 초과 8쌍.
//   7일 초과는 전부 진짜 별건이었다(임대 갔다가 1년 뒤 복귀 등, 간격이 수개월~1년).
//   클러스터 크기는 1(565) 또는 2(35) 뿐 — 3연속 이상 중복은 없다.
// 그래서 창을 7일로 둔다. 같은 클럽에 두 번 가는 실제 사례(임대→완전이적)는
// 유형이 다르거나 간격이 수개월이라 이 창에 걸리지 않는다.

/** 창 — 이 안에 붙어 있는 같은 조합은 한 건으로 본다. */
const NEAR_DAYS = 7;

export interface AfTransferKeyed {
  playerId: number;
  date: string; // YYYY-MM-DD
  inId: number;
  outId: number;
  type: string;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
}

/**
 * 같은 (선수·영입팀·방출팀·유형) 이 7일 안에 여러 날짜로 오면 가장 이른 것만 남긴다.
 * 가장 이른 것을 남기는 이유 — af 가 같은 건을 다시 내보내도 날짜가 밀리지 않는다.
 */
export function dedupeAfTransfers<T extends AfTransferKeyed>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${r.playerId}|${r.inId}|${r.outId}|${r.type}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const kept: T[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.date.localeCompare(b.date));
    let anchor: T | null = null;
    for (const r of g) {
      if (anchor && daysBetween(anchor.date, r.date) <= NEAR_DAYS) continue; // 같은 건의 재기록
      anchor = r;
      kept.push(r);
    }
  }
  return kept;
}
