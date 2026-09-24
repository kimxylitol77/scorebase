// TheSports 축구 stage_id → 라운드 이름("Second Round Qualifying"·"Round of 16" …).
// 경기 raw 의 round 엔 stage_id 만 있고 이름이 없다. 컵 대진표·대회 여정은 이름으로 라운드를 세우므로
// 수집할 때 붙여 둔다(렌더 때 ts 를 부르지 않는다). 같은 stage 는 한 번만 조회한다.
import { thesportsGet } from "./client";

const cache = new Map<string, string | null>();

export async function tsStageName(stageId: string): Promise<string | null> {
  if (cache.has(stageId)) return cache.get(stageId)!;
  let name: string | null = null;
  try {
    const r = await thesportsGet<{ code: number; results?: Array<{ name?: string }> }>("/v1/football/stage/list", { uuid: stageId });
    name = (r.results?.[0]?.name ?? "").trim() || null;
  } catch {
    // 조회 실패는 이름 없이 저장 — 다음 수집 때 다시 시도한다(실패는 캐시하지 않는다).
    return null;
  }
  cache.set(stageId, name);
  return name;
}
