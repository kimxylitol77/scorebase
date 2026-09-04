// af→ts 매핑이 가리키는 ts 선수 id 가 실제로 존재하는지 확인한다.
//
// 왜 필요한가. data/ts-af-player-map.json 에는 TheSportsPlayer 행이 없는 죽은 ts id 가 섞여 있다
// (2026-09-03 실측 5,294건 중 70건 — 같은 선수에 ts id 가 여럿 부여되며 생기는 유령 페이지 계열).
// 매핑만 믿고 /transfers/{tsId} 로 보내면 404 다. 링크·리다이렉트 전에 실재를 확인한다.
import { prisma } from "@/lib/db";

/** 주어진 ts id 중 실제 TheSportsPlayer 행이 있는 것만 돌려준다. 빈 입력은 조회 없이 빈 집합. */
export async function aliveTsPlayerIds(ids: Iterable<string>): Promise<Set<string>> {
  const list = [...new Set(ids)].filter(Boolean);
  if (list.length === 0) return new Set();
  const rows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: list } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** 단건 — 리다이렉트 판정용. */
export async function isTsPlayerAlive(id: string | null | undefined): Promise<boolean> {
  if (!id) return false;
  return (await aliveTsPlayerIds([id])).has(id);
}
