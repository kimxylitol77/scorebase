import eplRaw from "../../../data/match-shotmaps-epl-2526.json";
import laligaRaw from "../../../data/match-shotmaps-laliga-2526.json";
import serieARaw from "../../../data/match-shotmaps-serie-a-2526.json";
import bundesligaRaw from "../../../data/match-shotmaps-bundesliga-2526.json";
import ligue1Raw from "../../../data/match-shotmaps-ligue-1-2526.json";

export type ShotResult = "goal" | "save" | "post" | "block" | "miss" | string;

export interface MatchShot {
  pid: string;
  name: string;
  team: string;
  x: number;
  y: number;
  min: number;
  result: ShotResult;
  xg: number | null;
  sit: string | null;
  part: string | null;
  mouth: string | null;
  mouthXyz: { x: number; y: number; z: number } | null;
}

export interface MatchShotMap {
  sourceId: string;
  date: string;
  home: { id: string; name: string; score: number | null };
  away: { id: string; name: string; score: number | null };
  shots: MatchShot[];
}

type RawShotMap = Omit<MatchShotMap, "sourceId">;
type RawShotMapIndex = Record<string, RawShotMap>;

const DATA_BY_LEAGUE: Partial<Record<string, RawShotMapIndex>> = {
  EPL: eplRaw as RawShotMapIndex,
  LALIGA: laligaRaw as RawShotMapIndex,
  SERIE_A: serieARaw as RawShotMapIndex,
  BUNDESLIGA: bundesligaRaw as RawShotMapIndex,
  LIGUE_1: ligue1Raw as RawShotMapIndex,
};

const TEAM_WORDS_TO_DROP = new Set([
  "afc",
  "cf",
  "fc",
  "football",
  "club",
  "calcio",
]);

function normalizeTeamName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !TEAM_WORDS_TO_DROP.has(word))
    .join(" ");
}

function sameTeam(left: string, right: string): boolean {
  const a = normalizeTeamName(left);
  const b = normalizeTeamName(right);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));
  const shared = [...aWords].filter((word) => bWords.has(word));
  return shared.length >= Math.min(2, aWords.size, bWords.size);
}

function utcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function findMatchShotMap({
  league,
  startTime,
  homeName,
  awayName,
}: {
  league: string;
  startTime: Date;
  homeName: string;
  awayName: string;
}): MatchShotMap | null {
  const index = DATA_BY_LEAGUE[league];
  if (!index) return null;

  const expectedDate = utcDateKey(startTime);
  for (const [sourceId, row] of Object.entries(index)) {
    if (row.date !== expectedDate) continue;
    if (!sameTeam(row.home.name, homeName) || !sameTeam(row.away.name, awayName)) continue;
    if (!Array.isArray(row.shots) || row.shots.length === 0) return null;
    return { sourceId, ...row };
  }
  return null;
}
