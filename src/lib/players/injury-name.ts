// 부상·결장 명단의 선수명 한글 해석 — af 스냅샷은 "W. Saliba" 축약형으로 오는데,
// 예상 XI 에 든 선수만 nameKo 를 얻고 정작 결장자(=XI 에 없는 선수)는 영문이 그대로 나갔다.
// InjurySnapshot.playerTsId(EPL 실측 81% 보유)로 TheSportsPlayer.nameKo 를 직접 끌어온다.
// tsId 가 없는 나머지는 af 원문 유지 — 축약형은 성만 온전해 사전 매칭이 오탐을 낳는다.
import { prisma } from "@/lib/db";

/** playerTsId → nameKo. 빈 배열이면 조회 없이 빈 맵. */
export async function koNameByTsId(tsIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(tsIds.filter((v): v is string => !!v))];
  if (!ids.length) return new Map();
  const rows = await prisma.theSportsPlayer.findMany({
    where: { id: { in: ids }, nameKo: { not: null } },
    select: { id: true, nameKo: true },
  });
  return new Map(rows.map((r) => [r.id, r.nameKo!]));
}
