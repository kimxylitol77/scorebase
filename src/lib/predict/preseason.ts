// 프리시즌 경기 id — 순위·시즌 시뮬·파워랭킹에서 뺀다(Elo 는 호출부 규칙대로 전체 경기).
// NHL 만: ESPN 원본 season.slug "preseason" 이 유일한 표시다(경기 행에 칸이 없다). 시즌 경계(8/1)가 프리시즌을 포함해
// 개막 전인데 예측 표에 "4승" 이 뜨던 것(2026-09-30, 프리시즌 65경기 합산)의 수정. 일정 탭(LeagueFixtures)과 같은 판정.
// KHL·유럽 하키는 프리시즌이 HOCKEY_FRIENDLY 로 따로 수집돼 해당 없음. 야구 시범경기는 DB 에 표시가 없어 별도(preseasonCutoff).
import { prisma } from "@/lib/db";
import { currentSeasonStart } from "@/lib/predict/season-window";

const EMPTY: ReadonlySet<number> = new Set();

export async function preseasonMatchIds(league: string): Promise<ReadonlySet<number>> {
  if (league !== "NHL") return EMPTY;
  const since = currentSeasonStart(league);
  // raw 는 경기당 ~17KB 라 select 하지 않고 contains 로 id 만 받는다
  const rows = await prisma.match.findMany({
    where: { league, ...(since ? { startTime: { gte: since } } : {}), raw: { contains: '"slug":"preseason"' } },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** 프리시즌 경기를 뺀 목록 */
export async function withoutPreseason<T extends { id: number }>(matches: T[], league: string): Promise<T[]> {
  const pre = await preseasonMatchIds(league);
  return pre.size === 0 ? matches : matches.filter((m) => !pre.has(m.id));
}
