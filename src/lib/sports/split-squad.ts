// 같은 두 팀의 당일 홈·원정 2연전(스플릿 스쿼드)을 한 경기로 병합하지 않기 위한 dedup 판정.
//
// NHL 프리시즌은 같은 날 같은 시각에 A@B, B@A 두 경기를 따로 치른다(2026-09-23 OTT@TOR·TOR@OTT
// 둘 다 23:00Z). 소스 간 홈/원정 표기 차이를 흡수하려는 양방향 dedup 이 이 둘을 한 row 로
// 합쳐, 한 경기 방향에 다른 경기 점수가 뒤집혀 들어가고 나머지 한 경기는 사라졌다.
// 같은 소스가 한 번의 응답에 두 이벤트를 따로 실었다면 소스 스스로 별개 경기라고 말한 것이다.

type Pair = { homeTeamId: number; awayTeamId: number };

/**
 * dedup 후보가 이번 수집 묶음(같은 소스 응답)에 따로 실린 역방향 이벤트인가.
 * 참이면 같은 경기가 아니라 스플릿 스쿼드 짝이므로 병합 대상에서 뺀다.
 * 같은 방향 쌍둥이(소스가 같은 경기를 두 id 로 내보내는 유령)는 종전대로 병합되도록 역방향만 본다.
 */
export function isSplitSquadSibling(
  candidate: Pair & { externalId: string },
  incoming: Pair,
  batchExternalIds: ReadonlySet<string> | undefined,
): boolean {
  if (!batchExternalIds?.has(candidate.externalId)) return false;
  return (
    candidate.homeTeamId === incoming.awayTeamId &&
    candidate.awayTeamId === incoming.homeTeamId
  );
}

/**
 * 시각이 가장 가까운 dedup 후보. 거리가 같으면 홈/원정 방향이 같은 쪽을 고른다 —
 * 스플릿 스쿼드 두 row 가 킥오프까지 같아 아무거나 고르면 남의 경기에 점수가 들어간다.
 */
export function pickClosestCandidate<T extends Pair & { startTime: Date }>(
  candidates: readonly T[],
  incoming: Pair & { startMs: number },
): T | null {
  let best: T | null = null;
  let bestKey = Infinity;
  for (const c of candidates) {
    const sameDir = c.homeTeamId === incoming.homeTeamId && c.awayTeamId === incoming.awayTeamId;
    // 거리(ms) 우선, 동률이면 방향 일치가 이긴다(0.5ms 가산은 정수 ms 거리 순서를 안 바꾼다).
    const key = Math.abs(c.startTime.getTime() - incoming.startMs) + (sameDir ? 0 : 0.5);
    if (key < bestKey) {
      best = c;
      bestKey = key;
    }
  }
  return best;
}
