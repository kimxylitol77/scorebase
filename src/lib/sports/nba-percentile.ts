// NBA 선수 리그 백분위 계산 — ESPN byathlete 전체 선수 스탯 1콜 (DB 미영속).
// seasontype=2(정규시즌) 명시 필수 — 생략 시 시즌 종료 후엔 포스트시즌으로 해석된다 (실측).
// isqualified 는 정규시즌에서 실효가 없어(GP 1 포함) 최다출장 60% 자체 규정 적용. espnId 정확 매칭.
// 지표는 경기당 평균 PTS/REB/AST/STL/BLK.

import { unstable_cache } from "next/cache";
import { toKoreanPlayerName } from "@/lib/player-names";

export type NbaPercentiles = {
  league: string; // "NBA"
  playerName: string;
  teamName: string;
  season: string; // "2025-26"
  sample: number;
  minGames: number; // 규정 기준 경기수 (최다출장의 60%)
  games: number;
  metrics: { key: string; label: string; display: string; pct: number }[];
};

// NbaViews 와 동일한 시즌 판정 (9월부터 새 시즌) — ESPN season 파라미터는 종료 연도
function currentSeason(): { end: number; label: string } {
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const start = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { end: start + 1, label: `${start}-${String(start + 1).slice(2)}` };
}

type AthleteRow = {
  espnId: string;
  name: string;
  team: string;
  stats: Record<string, number>; // 카테고리명 무관 평탄화 (avgPoints 등)
};

async function fetchByAthlete(seasonEnd: number): Promise<AthleteRow[]> {
  const url =
    `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete` +
    `?region=us&lang=en&limit=800&season=${seasonEnd}&seasontype=2`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const d = (await res.json()) as {
    categories?: Array<{ name?: string; names?: string[] }>;
    athletes?: Array<{
      athlete?: { id?: string | number; displayName?: string; teamShortName?: string; teamName?: string };
      categories?: Array<{ name?: string; values?: number[] }>;
    }>;
  };
  // 스탯 이름은 top-level categories 에만 있음 — 카테고리명으로 zip
  const nameMap = new Map<string, string[]>();
  for (const c of d.categories ?? []) if (c.name) nameMap.set(c.name, c.names ?? []);
  const rows: AthleteRow[] = [];
  for (const a of d.athletes ?? []) {
    const id = a.athlete?.id;
    const name = a.athlete?.displayName;
    if (id == null || !name) continue;
    const stats: Record<string, number> = {};
    for (const c of a.categories ?? []) {
      const names = c.name ? nameMap.get(c.name) : undefined;
      if (!names) continue;
      (c.values ?? []).forEach((v, i) => {
        if (names[i] != null && typeof v === "number") stats[names[i]] = v;
      });
    }
    rows.push({
      espnId: String(id),
      name,
      team: a.athlete?.teamShortName ?? a.athlete?.teamName ?? "",
      stats,
    });
  }
  return rows;
}

// 전체 리스트는 1시간 캐시 — 선수별 계산은 캐시된 배열에서 즉석 수행
const getAthletes = unstable_cache(fetchByAthlete, ["nba-byathlete-summary"], { revalidate: 3600 });

function percentile(values: number[], v: number): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => x < v).length;
  return Math.round((below / (values.length - 1)) * 100);
}

export async function getNbaPercentiles(espnId: string): Promise<NbaPercentiles | null> {
  const { end, label } = currentSeason();
  const rows = await getAthletes(end).catch(() => []);
  if (rows.length < 100) return null; // 시즌 초·오프시즌 표본 부족

  const maxGames = Math.max(...rows.map((r) => r.stats.gamesPlayed ?? 0));
  const minGames = Math.ceil(maxGames * 0.6);
  const qualified = rows.filter((r) => (r.stats.gamesPlayed ?? 0) >= minGames);
  if (qualified.length < 50) return null;

  const me = qualified.find((r) => r.espnId === espnId);
  if (!me) return null;

  const defs: Array<{ key: string; label: string }> = [
    { key: "avgPoints", label: "득점" },
    { key: "avgRebounds", label: "리바운드" },
    { key: "avgAssists", label: "어시스트" },
    { key: "avgSteals", label: "스틸" },
    { key: "avgBlocks", label: "블록" },
  ];
  return {
    league: "NBA",
    playerName: toKoreanPlayerName(me.name) || me.name,
    teamName: me.team,
    season: label,
    sample: qualified.length,
    minGames,
    games: me.stats.gamesPlayed ?? 0,
    metrics: defs.map((d) => {
      const v = me.stats[d.key] ?? 0;
      return {
        key: d.key,
        label: d.label,
        display: v.toFixed(1),
        pct: percentile(qualified.map((r) => r.stats[d.key] ?? 0), v),
      };
    }),
  };
}
