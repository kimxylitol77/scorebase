// MLB 포스트시즌 선수 기록 조회 — statsapi stats?gameType=P(타격·투구 각 1콜) + 정규시즌 표의 한글 이름, 10분 캐시.
//   시즌별로 따로 조회한다(덮어쓰는 저장 없음). 기록이 없는 시즌(포스트시즌 시작 전)은 null — 기본 시즌 고르기는 페이지가 한다.
import { unstable_cache } from "next/cache";
import { toKoreanTeamName } from "@/lib/team-names";
import { getBbLeagueData } from "./player-rankings";
import { buildPostseasonRows, type PostseasonRows, type PsSplit } from "./mlb-postseason-stats-build";

const API = "https://statsapi.mlb.com/api/v1";

async function splits(season: number, group: "hitting" | "pitching"): Promise<PsSplit[]> {
  const qs = new URLSearchParams({ stats: "season", group, gameType: "P", season: String(season), sportId: "1", limit: "3000", playerPool: "ALL" });
  const r = await fetch(`${API}/stats?${qs}`, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`statsapi ${r.status}`);
  const d = (await r.json()) as { stats?: Array<{ splits?: PsSplit[] }> };
  return d.stats?.[0]?.splits ?? [];
}

export interface MlbPostseasonStats extends PostseasonRows {
  season: number;
}

/** 공식 기록만 캐시 — 기록이 없는 시즌은 null. statsapi 실패는 throw 라 캐시에 남지 않는다. */
const getSplits = unstable_cache(
  async (season: number) => {
    const [hitting, pitching] = await Promise.all([splits(season, "hitting"), splits(season, "pitching")]);
    return hitting.length === 0 && pitching.length === 0 ? null : { hitting, pitching };
  },
  ["mlb-postseason-splits-v1"],
  { revalidate: 600 },
);

export async function getMlbPostseasonStats(season: number): Promise<MlbPostseasonStats | null> {
  const raw = await getSplits(season).catch((e: Error) => {
    console.warn("[mlb-postseason-stats] 조회 실패:", e.message);
    return null;
  });
  if (!raw) return null;
  // 한글 이름은 캐시 밖에서 붙인다 — DB 가 잠깐 막혀 영문 이름으로 떨어져도 그 결과가 10분간 굳지 않게.
  // 정규시즌 MLB 표(externalId = statsapi 선수 id, 자체 6시간 캐시). 이름은 시즌이 바뀌어도 같다.
  const reg = await getBbLeagueData("MLB").catch(() => null);
  const nameKo = new Map<string, string>();
  for (const r of reg?.rows ?? []) if (r.externalId) nameKo.set(r.externalId, r.name);
  const built = buildPostseasonRows(raw.hitting, raw.pitching, (id) => nameKo.get(id), (name) => toKoreanTeamName(name, "MLB") || name);
  return { season, ...built };
}
