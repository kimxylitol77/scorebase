// NHL 스케이터·골리 리그 백분위 계산 — api.nhle.com stats REST 전체 시즌 스탯 1콜 (DB 미영속).
// playerId 정확 매칭. 규정 = 스케이터 최다출장 60% / 골리 40% 이상 출장. 미달·표본 부족이면 null.
// GAA 는 낮을수록 좋으므로 백분위 반전.

import { unstable_cache } from "next/cache";
import { toKoreanPlayerName } from "@/lib/player-names";

export type NhlPercentileMetric = {
  key: string;
  label: string;
  display: string;
  pct: number; // 0~100 백분위 (높을수록 리그 상위 = 좋음)
};

export type NhlPercentiles = {
  league: string; // "NHL"
  playerName: string;
  teamName: string;
  season: string; // "2025-26"
  sample: number;
  minGames: number;
  games: number;
  metrics: NhlPercentileMetric[];
};

// NhlViews 와 동일한 시즌 판정 (9월부터 새 시즌)
function currentSeasonId(): { id: string; label: string } {
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const start = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { id: `${start}${start + 1}`, label: `${start}-${String(start + 1).slice(2)}` };
}

type SkaterRow = {
  playerId: number;
  skaterFullName: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  shots: number;
};

type GoalieRow = {
  playerId: number;
  goalieFullName: string;
  teamAbbrevs: string;
  gamesPlayed: number;
  wins: number;
  saves: number;
  shutouts: number;
  savePct: number | null;
  goalsAgainstAverage: number | null;
};

async function fetchSummary<T>(kind: "skater" | "goalie", seasonId: string): Promise<T[]> {
  const url =
    `https://api.nhle.com/stats/rest/en/${kind}/summary?limit=-1` +
    `&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`;
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: T[] };
  return data.data ?? [];
}

// 전체 리스트는 1시간 캐시 — 선수별 계산은 캐시된 배열에서 즉석 수행
const getSkaters = unstable_cache(
  (seasonId: string) => fetchSummary<SkaterRow>("skater", seasonId),
  ["nhl-skater-summary"],
  { revalidate: 3600 },
);
const getGoalies = unstable_cache(
  (seasonId: string) => fetchSummary<GoalieRow>("goalie", seasonId),
  ["nhl-goalie-summary"],
  { revalidate: 3600 },
);

function percentile(values: number[], v: number, lowerIsBetter = false): number {
  if (values.length <= 1) return 50;
  const below = values.filter((x) => x < v).length;
  const pct = Math.round((below / (values.length - 1)) * 100);
  return lowerIsBetter ? 100 - pct : pct;
}

export async function getNhlSkaterPercentiles(playerId: number): Promise<NhlPercentiles | null> {
  const { id, label } = currentSeasonId();
  const rows = await getSkaters(id).catch(() => []);
  if (rows.length < 100) return null; // 시즌 초·오프시즌 표본 부족

  const maxGames = Math.max(...rows.map((r) => r.gamesPlayed));
  const minGames = Math.ceil(maxGames * 0.6);
  const qualified = rows.filter((r) => r.gamesPlayed >= minGames);
  if (qualified.length < 30) return null;

  const me = qualified.find((r) => r.playerId === playerId);
  if (!me) return null;

  const defs: Array<{ key: string; label: string; get: (r: SkaterRow) => number }> = [
    { key: "goals", label: "골", get: (r) => r.goals },
    { key: "assists", label: "어시스트", get: (r) => r.assists },
    { key: "points", label: "포인트", get: (r) => r.points },
    { key: "plusMinus", label: "+/-", get: (r) => r.plusMinus },
    { key: "shots", label: "슛", get: (r) => r.shots },
  ];
  const name = toKoreanPlayerName(me.skaterFullName) || me.skaterFullName;
  return {
    league: "NHL",
    playerName: name,
    teamName: me.teamAbbrevs,
    season: label,
    sample: qualified.length,
    minGames,
    games: me.gamesPlayed,
    metrics: defs.map((d) => ({
      key: d.key,
      label: d.label,
      display: String(d.get(me)),
      pct: percentile(qualified.map(d.get), d.get(me)),
    })),
  };
}

export async function getNhlGoaliePercentiles(playerId: number): Promise<NhlPercentiles | null> {
  const { id, label } = currentSeasonId();
  const rows = await getGoalies(id).catch(() => []);
  if (rows.length < 30) return null;

  const maxGames = Math.max(...rows.map((r) => r.gamesPlayed));
  const minGames = Math.ceil(maxGames * 0.4);
  const qualified = rows.filter((r) => r.gamesPlayed >= minGames);
  if (qualified.length < 15) return null;

  const me = qualified.find((r) => r.playerId === playerId);
  if (!me) return null;

  const num = (v: number | null) => v ?? 0;
  const defs: Array<{
    key: string;
    label: string;
    get: (r: GoalieRow) => number;
    fmt: (v: number) => string;
    lowerIsBetter?: boolean;
  }> = [
    { key: "savePct", label: "SV%", get: (r) => num(r.savePct), fmt: (v) => v.toFixed(3) },
    { key: "gaa", label: "GAA", get: (r) => num(r.goalsAgainstAverage), fmt: (v) => v.toFixed(2), lowerIsBetter: true },
    { key: "wins", label: "승리", get: (r) => r.wins, fmt: (v) => String(v) },
    { key: "saves", label: "세이브", get: (r) => r.saves, fmt: (v) => String(v) },
    { key: "shutouts", label: "완봉", get: (r) => r.shutouts, fmt: (v) => String(v) },
  ];
  const name = toKoreanPlayerName(me.goalieFullName) || me.goalieFullName;
  return {
    league: "NHL",
    playerName: name,
    teamName: me.teamAbbrevs,
    season: label,
    sample: qualified.length,
    minGames,
    games: me.gamesPlayed,
    metrics: defs.map((d) => ({
      key: d.key,
      label: d.label,
      display: d.fmt(d.get(me)),
      pct: percentile(qualified.map(d.get), d.get(me), d.lowerIsBetter),
    })),
  };
}
