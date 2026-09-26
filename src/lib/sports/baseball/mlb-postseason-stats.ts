// MLB 포스트시즌 선수 기록 조회 — statsapi stats?gameType=P(타격·투구 각 1콜) + 정규시즌 표의 한글 이름, 10분 캐시.
//   올해 포스트시즌 기록이 아직 없으면(개막 전) 지난 시즌 포스트시즌을 돌려준다 — 페이지가 "지난 시즌" 라벨을 붙인다.
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

async function load(season: number): Promise<MlbPostseasonStats | null> {
  let yr = season;
  let [h, p] = await Promise.all([splits(yr, "hitting"), splits(yr, "pitching")]);
  if (h.length === 0 && p.length === 0) {
    yr = season - 1;
    [h, p] = await Promise.all([splits(yr, "hitting"), splits(yr, "pitching")]);
  }
  if (h.length === 0 && p.length === 0) return null;
  // 한글 이름 — 정규시즌 MLB 표(externalId = statsapi 선수 id). 이름은 시즌이 바뀌어도 같다.
  const reg = await getBbLeagueData("MLB").catch(() => null);
  const nameKo = new Map<string, string>();
  for (const r of reg?.rows ?? []) if (r.externalId) nameKo.set(r.externalId, r.name);
  const built = buildPostseasonRows(h, p, (id) => nameKo.get(id), (name) => toKoreanTeamName(name, "MLB") || name);
  return { season: yr, ...built };
}

export const getMlbPostseasonStats = unstable_cache(
  async (season: number) => {
    try {
      return await load(season);
    } catch (e) {
      console.warn("[mlb-postseason-stats] 조회 실패:", (e as Error).message);
      return null;
    }
  },
  ["mlb-postseason-stats-v1"],
  { revalidate: 600 },
);
