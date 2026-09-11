// UFC 재발급 이벤트 판정 — 같은 대진이 새 이벤트 id 로 들어오면 버려진 옛 행을 골라낸다(순수 함수)
//
// 왜 필요한가. collect-mma 는 The Odds API 이벤트 id 로 행을 upsert 한다. 대회 일정이 바뀌면
// 같은 대진에 새 id 가 발급돼 새 행이 생기고, 옛 행은 다시는 갱신·결과 반영되지 않은 채
// SCHEDULED 로 남는다. 기존 정리는 "ESPN 확정 카드에 없는 대진"만 지우는데 대진 키가 이름만
// 보므로 옛 행도 확정 카드로 통과한다(2026-09-11 Pantoja·Tsarukyan·Tuivasa 3경기, 9/10→9/20).

export interface ScheduledRow {
  id: number;
  externalId: string;
  pairKey: string;
}

export interface SeenEvent {
  externalId: string;
  pairKey: string;
}

/**
 * 이번 수집에서 upsert 한 이벤트(seen)와 대조해 재발급으로 버려진 SCHEDULED 행 id 를 돌려준다.
 * 조건: 자기 이벤트 id 는 이번 피드에 없고, 같은 대진은 다른 id 로 이번에 들어왔다.
 * seen 이 비면(피드 장애) 아무것도 고르지 않는다 — 전부 "피드에 없음"으로 읽혀 일괄 삭제되는 걸 막는다.
 */
export function findReissuedEventRows(rows: ScheduledRow[], seen: SeenEvent[]): number[] {
  if (seen.length === 0) return [];
  const seenIds = new Set(seen.map((e) => e.externalId));
  const seenPairs = new Set(seen.map((e) => e.pairKey));
  return rows
    .filter((r) => !seenIds.has(r.externalId) && seenPairs.has(r.pairKey))
    .map((r) => r.id);
}
