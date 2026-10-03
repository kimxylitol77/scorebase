// 프리시즌 경기 id — 순위·시즌 시뮬·파워랭킹·Elo(경기 예측·채점·화면)에서 뺀다.
// NHL·NBA: 표시는 두 가지 — ESPN 원본 season.slug "preseason", ts 워커가 남기는 {"thesports":{"preseason":true}}(농구 diary kind=3).
//  경기 행에 칸이 없어 raw 로 판정한다. 시즌 경계(8/1)가 프리시즌을 포함해
// 개막 전인데 예측 표에 "4승" 이 뜨던 것(2026-09-30, 프리시즌 65경기 합산)의 수정. 일정 탭(LeagueFixtures)과 같은 판정.
// Elo 제외 백테스트(2026-09-30, 2025-26 정규 1,305경기 같은 표본): 적중 53.87→54.10%, Brier 0.2457→0.2459 — 중립.
// NBA(2026-09-30): 백테스트 2025-26 정규 1,243경기 같은 표본 적중 67.74→67.82%, Brier 0.2072→0.2070. 올해 경기는 ts 로 들어와
//  raw 가 비어 있어 ESPN 표시가 없다 → ts kind 표시(basketball-match-collector + scripts/backfill-nba-preseason-flag.ts).
// KHL·유럽 하키는 프리시즌이 HOCKEY_FRIENDLY 로 따로 수집돼 해당 없음. 야구 시범경기는 DB 에 표시가 없어 별도(preseasonCutoff).
import { prisma } from "@/lib/db";

const EMPTY: ReadonlySet<number> = new Set();
// WNBA(2026-10-03): 표시는 ts kind=3(basketball-match-collector + scripts/backfill-wnba-season-phase.ts). Elo 제외 백테스트
//  2026 정규 330경기 같은 표본 적중 66.36→65.76%, Brier 0.2055→0.2063 — 조금 나빠진다(DB 에 지난 시즌이 없어 프리시즌이
//  유일한 초반 신호). 순위·시뮬·예측이 같은 경기 목록을 쓰도록 NBA 와 같은 규칙을 택했다(운영 결정). 2027 개막 초반에 다시 볼 것.
const PRESEASON_LEAGUES = new Set(["NHL", "NBA", "WNBA"]);
// raw LIKE 스캔(NHL 전 기간 ~3천 행 × 17KB, 0.4초)이라 프로세스 안에서 30분 재사용 — 프리시즌 판정은 경기 생성 후 바뀌지 않는다.
const TTL_MS = 30 * 60_000;
const memo = new Map<string, { at: number; ids: Promise<ReadonlySet<number>> }>();

export function preseasonMatchIds(league: string): Promise<ReadonlySet<number>> {
  if (!PRESEASON_LEAGUES.has(league)) return Promise.resolve(EMPTY);
  const hit = memo.get(league);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.ids;
  // raw 는 select 하지 않고 contains 로 id 만 받는다. 전 기간 — Elo 는 시즌을 넘어 누적된다.
  const ids = prisma.match
    .findMany({
      where: { league, OR: [{ raw: { contains: '"slug":"preseason"' } }, { raw: { contains: '"preseason":true' } }] },
      select: { id: true },
    })
    .then((rows) => new Set(rows.map((r) => r.id)) as ReadonlySet<number>);
  ids.catch(() => memo.delete(league)); // 실패는 캐시하지 않는다
  memo.set(league, { at: Date.now(), ids });
  return ids;
}

/** 프리시즌을 빼는 모든 리그(NHL·NBA·WNBA)의 프리시즌 id — 여러 리그를 한 번에 다루는 잡(예측·채점·AI 대결)의 where 용. */
export async function allPreseasonMatchIds(): Promise<number[]> {
  const sets = await Promise.all([...PRESEASON_LEAGUES].map((l) => preseasonMatchIds(l)));
  return sets.flatMap((s) => [...s]);
}

/** 프리시즌 경기를 뺀 목록. league 는 목록의 리그(여러 리그가 섞인 목록이면 각 행 league 로 판정). */
export async function withoutPreseason<T extends { id: number; league?: string }>(matches: T[], league: string): Promise<T[]> {
  const pre = await preseasonMatchIds(league);
  return pre.size === 0 ? matches : matches.filter((m) => !pre.has(m.id));
}
