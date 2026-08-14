// 베트맨 프로토 배당 조회 — /odds 패널용. 적재는 betman-odds-cron (reports/plans/betman-odds/).

import { prisma } from "@/lib/db";

export interface BetmanRow {
  id: string;
  gmTs: number;
  /** ISO 문자열 — 호출부가 unstable_cache 로 감싸면 Date 가 JSON 직렬화되며 문자열이 된다.
      타입만 Date 로 두면 렌더에서 "Invalid time value" 로 터진다(실측). 경계를 명시한다. */
  gameDate: string;
  leagueName: string;
  homeName: string;
  awayName: string;
  winAllot: number | null;
  drawAllot: number | null;
  loseAllot: number | null;
  winVotes: number | null;
  drawVotes: number | null;
  loseVotes: number | null;
}

/** /odds 의 종목 탭 ↔ 베트맨 itemCode. 베트맨은 축구·야구·농구만 발매한다. */
const ITEM_CODE: Record<string, string> = { soccer: "SC", baseball: "BS", basketball: "BK" };

/**
 * 기본형(핸디캡·언더오버·홀짝 제외) 배당만 뽑는다.
 * 축구 = "승무패"(3-way), 야구·농구 = "일반 승패"(2-way).
 * 같은 경기가 유형마다 다른 행으로 오므로 이 필터가 없으면 한 경기가 5줄이 된다.
 */
const BET_TYPE: Record<string, string[]> = {
  soccer: ["승무패"],
  baseball: ["일반 승패"],
  basketball: ["일반 승패"],
};

export async function getBetmanRows(sport: string, take = 40): Promise<BetmanRow[]> {
  const itemCode = ITEM_CODE[sport];
  const betTypNm = BET_TYPE[sport];
  if (!itemCode || !betTypNm) return [];

  const rows = await prisma.betmanOdds.findMany({
    where: {
      itemCode,
      betTypNm: { in: betTypNm },
      // 배당이 아직 안 매겨진 행(미래 회차 편성분)은 보여줄 게 없다.
      winAllot: { not: null },
      // 이미 끝난 경기는 뺀다. 진행 중인 것(3h 이내 시작)은 남겨 배당을 볼 수 있게.
      gameDate: { gt: new Date(Date.now() - 3 * 3600 * 1000) },
    },
    // 같은 경기가 여러 회차에 걸쳐 발매된다 → 회차 내림차순으로 받아 첫 등장(=최신 회차)만 남긴다.
    orderBy: [{ gameDate: "asc" }, { gmTs: "desc" }],
    take: take * 3,
    select: {
      id: true, gmTs: true, gameDate: true, leagueName: true,
      homeName: true, awayName: true,
      winAllot: true, drawAllot: true, loseAllot: true,
      winVotes: true, drawVotes: true, loseVotes: true,
    },
  });

  // 경기 단위 중복 제거. 마감된 직전 회차에도 같은 경기가 들어 있어 그대로 두면 두 줄이 된다.
  const seen = new Set<string>();
  const out: BetmanRow[] = [];
  for (const r of rows) {
    const key = `${r.gameDate.getTime()}|${r.homeName}|${r.awayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, gameDate: r.gameDate.toISOString() });
    if (out.length >= take) break;
  }
  return out;
}
