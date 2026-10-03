// TS_COVERED 리그 중 TheSports 가 실제로 경기를 안 가져오는 리그를 골라 api-football 수집으로 되돌린다.
// 배경(2026-10-03): 매핑 파일에 tsSeasonId 만 있으면 af 수집이 꺼지는데, ts 가 실제로 경기를 넣는지는 아무도 안 봤다.
// ISL(새 시즌 ts 0건)·UAE(9/11 이후 0건)·HNL·세르비아가 전부 이 구멍으로 일정이 통째 비었고, 사람이 알림·화면으로
// 뒤늦게 찾아 TS_COVERED_EXCEPTIONS 에 손으로 넣어 왔다. 이제 collect 가 매번 실적으로 판정한다.
//
// 실적 = 창(지난 14일 ~ 앞으로 30일) 안에 ts 가 만든 행(ts- 접두) 또는 ts 캐시가 붙은 행이 1건이라도 있는가.
//   - 빅 리그는 af/ESPN 이 먼저 행을 만들고 ts 는 캐시로만 붙으므로 접두만 보면 EPL 도 "0" 으로 오판한다.
//   - 앞으로 30일까지 보는 이유: 대륙 컵처럼 경기일 사이가 2주 넘게 비는 대회가 휴식 구간마다 af 로 넘어가지 않게.
// af 로 넘어가도 위험은 작다 — 창 안에 경기가 없으면 af 도 가져올 게 없고, 나중에 ts 가 같은 경기를 넣으면
// thesports-matches 의 72h dedup 이 기존 행을 찾아 시각만 교정한다.
import { prisma } from "@/lib/db";

export const TS_ACTIVITY_PAST_DAYS = 14;
export const TS_ACTIVITY_FUTURE_DAYS = 30;

/** 실적이 확인된 리그 집합을 받아, 후보 중 실적 없는 리그만 돌려준다(순서 유지). */
export function pickTsInactive<T extends string>(candidates: readonly T[], active: ReadonlySet<string>): T[] {
  return candidates.filter((l) => !active.has(l));
}

/** 후보 리그 중 창 안에 ts 실적이 0인 리그. DB 오류면 빈 배열(기존 동작 = af skip 유지). */
export async function tsInactiveLeagues<T extends string>(candidates: readonly T[], now: Date = new Date()): Promise<T[]> {
  if (candidates.length === 0) return [];
  try {
    const rows = await prisma.match.groupBy({
      by: ["league"],
      where: {
        league: { in: [...candidates] },
        startTime: {
          gte: new Date(now.getTime() - TS_ACTIVITY_PAST_DAYS * 86400_000),
          lte: new Date(now.getTime() + TS_ACTIVITY_FUTURE_DAYS * 86400_000),
        },
        OR: [{ externalId: { startsWith: "ts-" } }, { theSportsCache: { isNot: null } }],
      },
      _count: true,
    });
    return pickTsInactive(candidates, new Set(rows.map((r) => r.league)));
  } catch (e) {
    console.warn("[ts-coverage-fallback] 실적 조회 실패 — af skip 유지:", (e as Error).message);
    return [];
  }
}
