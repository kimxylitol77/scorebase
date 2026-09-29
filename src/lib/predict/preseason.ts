// 프리시즌 경기 id — 순위·시즌 시뮬·파워랭킹·Elo(경기 예측·채점·화면)에서 뺀다.
// NHL 만: ESPN 원본 season.slug "preseason" 이 유일한 표시다(경기 행에 칸이 없다). 시즌 경계(8/1)가 프리시즌을 포함해
// 개막 전인데 예측 표에 "4승" 이 뜨던 것(2026-09-30, 프리시즌 65경기 합산)의 수정. 일정 탭(LeagueFixtures)과 같은 판정.
// Elo 제외 백테스트(2026-09-30, 2025-26 정규 1,305경기 같은 표본): 적중 53.87→54.10%, Brier 0.2457→0.2459 — 중립.
// KHL·유럽 하키는 프리시즌이 HOCKEY_FRIENDLY 로 따로 수집돼 해당 없음. 야구 시범경기는 DB 에 표시가 없어 별도(preseasonCutoff).
import { prisma } from "@/lib/db";

const EMPTY: ReadonlySet<number> = new Set();
const PRESEASON_LEAGUES = new Set(["NHL"]);
// raw LIKE 스캔(NHL 전 기간 ~3천 행 × 17KB, 0.4초)이라 프로세스 안에서 30분 재사용 — 프리시즌 판정은 경기 생성 후 바뀌지 않는다.
const TTL_MS = 30 * 60_000;
const memo = new Map<string, { at: number; ids: Promise<ReadonlySet<number>> }>();

export function preseasonMatchIds(league: string): Promise<ReadonlySet<number>> {
  if (!PRESEASON_LEAGUES.has(league)) return Promise.resolve(EMPTY);
  const hit = memo.get(league);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  // raw 는 select 하지 않고 contains 로 id 만 받는다. 전 기간 — Elo 는 시즌을 넘어 누적된다.
  const ids = prisma.match
    .findMany({ where: { league, raw: { contains: '"slug":"preseason"' } }, select: { id: true } })
    .then((rows) => new Set(rows.map((r) => r.id)) as ReadonlySet<number>);
  ids.catch(() => memo.delete(league)); // 실패는 캐시하지 않는다
  memo.set(league, { at: Date.now(), ids });
  return ids;
}

/** 프리시즌 경기를 뺀 목록. league 는 목록의 리그(여러 리그가 섞인 목록이면 각 행 league 로 판정). */
export async function withoutPreseason<T extends { id: number; league?: string }>(matches: T[], league: string): Promise<T[]> {
  const pre = await preseasonMatchIds(league);
  return pre.size === 0 ? matches : matches.filter((m) => !pre.has(m.id));
}
