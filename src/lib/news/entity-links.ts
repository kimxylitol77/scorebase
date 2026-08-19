// 브리핑 본문에 등장하는 팀 이름을 팀 페이지 링크로 바꾼다.
//
// 선수는 넣지 않는다 — 선수 페이지(/players/[pid])가 숫자 id 만 받는데 축구 선수의 정본은
// TheSportsPlayer 의 문자열 해시 id 라 404 가 된다(2026-08-19 실측). 리그마다 id 체계도
// 갈려 있어(MLB personId·NBA bdlId·KBO pid) 자동 링크는 죽은 링크를 대량 생산한다.
// 선수 링크는 URL 체계가 하나로 정리된 뒤에 붙인다.
import { prisma } from "@/lib/db";
import type { LinkRule } from "@/lib/internal-links";

// 2자 팀명(85개)은 일반 단어와 겹칠 위험이 커서 제외한다 — "키스"·"브란" 류.
const MIN_TEAM_NAME_LEN = 3;

/**
 * 본문에 실제로 등장하는 팀만 골라 링크 규칙으로 돌려준다.
 * 팀 목록을 통째로 들고 오지 않고 DB 에서 포함 여부를 판정한다 (본문이 짧고 팀은 2,400여 개).
 * 같은 한글명을 가진 중복 row 는 id 가 작은 쪽 하나만 쓴다.
 */
export async function findTeamLinks(body: string): Promise<LinkRule[]> {
  if (!body.trim()) return [];
  const rows = await prisma.$queryRaw<{ id: number; nameKo: string }[]>`
    SELECT DISTINCT ON ("nameKo") id, "nameKo"
    FROM "Team"
    WHERE "nameKo" IS NOT NULL
      AND length("nameKo") >= ${MIN_TEAM_NAME_LEN}
      AND position("nameKo" IN ${body}) > 0
    ORDER BY "nameKo", id ASC
  `;
  // 1) 다른 팀명에 포함되는 이름은 버린다 — "맨체스터" 가 먼저 걸려 "맨체스터 시티" 를 쪼개는 걸 막는다.
  const names = rows.map((r) => r.nameKo);
  const kept = rows.filter((r) => !names.some((n) => n !== r.nameKo && n.includes(r.nameKo)));
  // 2) 본문에 먼저 나오는 순서대로 — 상한(2개)에 걸릴 때 기사 주인공이 남게 한다.
  //    길이순으로 두면 부수적으로 스친 이름이 주어를 밀어낸다(실측: 주인공 대신 "스위스" 가 링크됨).
  return kept
    .sort((a, b) => body.indexOf(a.nameKo) - body.indexOf(b.nameKo))
    .map((r) => ({ keyword: r.nameKo, href: `/teams/${r.id}` }));
}
