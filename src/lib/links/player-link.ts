// TheSports(ts) 선수 id → 선수 상세 링크 판정 — 단일 출처.
//
// ts player id 는 "1l4rjnhe7wxm7vx" 같은 문자열이고, 정본 상세는 /transfers/{tsId} 다.
// 숫자 id 만 받는 /players/[pid] 로 넘기면 통째로 404 가 난다
// (2026-08-19 실측: /soccer/sub-impact 조커 랭킹 링크 76건 전부 404).
//
// 등록 여부까지 여기서 판정한다 — 갈 데가 없는 id 는 링크를 안 거는 편이 404 보다 낫다.

import { prisma } from "@/lib/db";

/** ts player id 의 선수 상세 경로. */
export const tsPlayerHref = (tsId: string) => `/transfers/${tsId}`;

/**
 * 주어진 ts player id 중 /transfers 상세가 실제로 열리는 것만 추린다.
 *
 * 판정 기준은 /transfers/[id] 의 loadPlayer 와 동일 — TheSportsPlayer 나
 * PlayerMarketValue 둘 중 하나만 있으면 페이지가 렌더된다. 둘 다 없으면 notFound.
 * (ts 이벤트·af↔ts 자동 매핑에는 실물 없는 id 가 섞여 있다 — 2026-08 홍현석·양민혁 실측)
 */
export async function linkableTsPlayerIds(ids: Iterable<string>): Promise<Set<string>> {
  const arr = [...new Set(ids)].filter(Boolean);
  const out = new Set<string>();
  // 자동완성 인덱스는 리더 3천여 명을 한 번에 넘긴다 — IN 목록을 잘라 던진다.
  for (let i = 0; i < arr.length; i += 2000) {
    const chunk = arr.slice(i, i + 2000);
    const [tsp, mv] = await Promise.all([
      prisma.theSportsPlayer.findMany({ where: { id: { in: chunk } }, select: { id: true } }),
      prisma.playerMarketValue.findMany({ where: { id: { in: chunk } }, select: { id: true } }),
    ]);
    for (const r of tsp) out.add(r.id);
    for (const r of mv) out.add(r.id);
  }
  return out;
}
