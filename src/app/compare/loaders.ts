// 선수 비교 종목별 로더 — NBA·NHL·LOL. 기존 선수페이지 fetch 함수 재사용해 비교용 정규화 데이터 반환.
import { fetchNbaPlayer } from "@/lib/sports/balldontlie";
import { fetchNbaEspnStats } from "@/lib/sports/espn-nba-player";
import { lookupNbaPlayer } from "@/lib/sports/nba-players";
import { fetchNhlPlayerLanding } from "@/lib/sports/nhl-api";
import { getLolPlayerDetail } from "@/lib/sports/lol-player-stats";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import { toNbaRadarAxes, toNhlRadarAxes, toLolRadarAxes } from "@/lib/sport-radar";
import type { RadarAxis } from "@/lib/player-radar";
import lolPlayersData from "../../../data/lol-players.json";

const LOL_PROFILES = (lolPlayersData as { players: Record<string, { name?: string; realName?: string; photo?: string; position?: number }> }).players;

export interface RadarComparePlayer {
  id: string;
  name: string;
  photo: string | null;
  sub: string | null;
  axes: RadarAxis[] | null;
  radarKind: string | null; // NHL: skater|goalie. 그 외 단일 종목값.
  stats: Record<string, number>;
}

export interface StatRowDef {
  label: string;
  key: string;
  lowerBetter?: boolean;
  fmt: (v: number) => string;
}

// 포맷 헬퍼
const int = (v: number) => Math.round(v).toLocaleString();
const dec1 = (v: number) => v.toFixed(1);
const dec2 = (v: number) => v.toFixed(2);
const dec3 = (v: number) => v.toFixed(3);
const pct0 = (v: number) => `${Math.round(v * 100)}%`; // 0~1 → %
const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`; // 0~1 → %

// ── LOL ──
export const LOL_ROWS: StatRowDef[] = [
  { label: "세트", key: "games", fmt: int },
  { label: "KDA", key: "kda", fmt: dec2 },
  { label: "킬", key: "kills", fmt: int },
  { label: "데스", key: "deaths", lowerBetter: true, fmt: int },
  { label: "어시스트", key: "assists", fmt: int },
  { label: "CS/분", key: "csPerMin", fmt: dec1 },
  { label: "승률", key: "winRate", fmt: pct0 },
];
export async function loadLol(id: string): Promise<RadarComparePlayer | null> {
  const detail = await getLolPlayerDetail(id);
  const prof = LOL_PROFILES[id];
  if (!detail && !prof) return null;
  const agg = detail?.agg ?? null;
  const name = prof?.name || agg?.name || "선수";
  return {
    id,
    name,
    photo: prof?.photo ?? null,
    sub: prof?.realName ?? null,
    axes: agg && agg.games > 0 ? toLolRadarAxes(agg) : null,
    radarKind: "lol",
    stats: agg
      ? { games: agg.games, kda: agg.kda, kills: agg.kills, deaths: agg.deaths, assists: agg.assists, csPerMin: agg.csPerMin, winRate: agg.winRate }
      : {},
  };
}

// ── NBA ──
export const NBA_ROWS: StatRowDef[] = [
  { label: "경기", key: "gamesPlayed", fmt: int },
  { label: "득점", key: "pts", fmt: dec1 },
  { label: "리바운드", key: "reb", fmt: dec1 },
  { label: "어시스트", key: "ast", fmt: dec1 },
  { label: "스틸", key: "stl", fmt: dec1 },
  { label: "블록", key: "blk", fmt: dec1 },
  { label: "야투%", key: "fgPct", fmt: pct1 },
  { label: "3점%", key: "fg3Pct", fmt: pct1 },
  { label: "자유투%", key: "ftPct", fmt: pct1 },
  { label: "턴오버", key: "turnover", lowerBetter: true, fmt: dec1 },
];
export async function loadNba(id: string): Promise<RadarComparePlayer | null> {
  const num = Number(id);
  if (!Number.isFinite(num)) return null;
  const profile = await fetchNbaPlayer(num);
  if (!profile) return null;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const tsp = lookupNbaPlayer(fullName);
  const espnId = tsp?.espnId;
  const { avg } = espnId ? await fetchNbaEspnStats(espnId) : { avg: null };
  const teamKo = profile.team ? toKoreanTeamName(profile.team.fullName) || profile.team.fullName : null;
  return {
    id,
    name: toKoreanPlayerName(fullName) || fullName,
    photo: tsp?.photo ?? null,
    sub: [profile.position, teamKo].filter(Boolean).join(" · ") || null,
    axes: avg ? toNbaRadarAxes(avg) : null,
    radarKind: "nba",
    stats: avg
      ? { gamesPlayed: avg.gamesPlayed, pts: avg.pts, reb: avg.reb, ast: avg.ast, stl: avg.stl, blk: avg.blk, fgPct: avg.fgPct, fg3Pct: avg.fg3Pct, ftPct: avg.ftPct, turnover: avg.turnover }
      : {},
  };
}

// ── NHL (스케이터/골리 분기) ──
export const NHL_SKATER_ROWS: StatRowDef[] = [
  { label: "경기", key: "gamesPlayed", fmt: int },
  { label: "골", key: "goals", fmt: int },
  { label: "어시스트", key: "assists", fmt: int },
  { label: "포인트", key: "points", fmt: int },
  { label: "슛(SOG)", key: "shots", fmt: int },
  { label: "PP골", key: "powerPlayGoals", fmt: int },
  { label: "결승골", key: "gameWinningGoals", fmt: int },
  { label: "PIM", key: "pim", lowerBetter: true, fmt: int },
];
export const NHL_GOALIE_ROWS: StatRowDef[] = [
  { label: "경기", key: "gamesPlayed", fmt: int },
  { label: "승", key: "wins", fmt: int },
  { label: "패", key: "losses", lowerBetter: true, fmt: int },
  { label: "SV%", key: "savePctg", fmt: dec3 },
  { label: "GAA", key: "goalsAgainstAvg", lowerBetter: true, fmt: dec2 },
  { label: "완봉", key: "shutouts", fmt: int },
];
export async function loadNhl(id: string): Promise<RadarComparePlayer | null> {
  const num = Number(id);
  if (!Number.isFinite(num)) return null;
  const profile = await fetchNhlPlayerLanding(num);
  if (!profile) return null;
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const f = profile.featured ?? {};
  const isGoalie = profile.position === "G";
  const { axes } = toNhlRadarAxes(profile);
  const hasStats = Object.keys(f).length > 0;
  const teamKo = profile.teamFullName ? toKoreanTeamName(profile.teamFullName) || profile.teamFullName : null;
  const keys = isGoalie
    ? ["gamesPlayed", "wins", "losses", "savePctg", "goalsAgainstAvg", "shutouts"]
    : ["gamesPlayed", "goals", "assists", "points", "shots", "powerPlayGoals", "gameWinningGoals", "pim"];
  const stats: Record<string, number> = {};
  for (const k of keys) stats[k] = f[k] ?? 0;
  return {
    id,
    name: toKoreanPlayerName(fullName) || fullName,
    photo: profile.headshot ?? null,
    sub: [profile.position, teamKo].filter(Boolean).join(" · ") || null,
    axes: hasStats ? axes : null,
    radarKind: isGoalie ? "goalie" : "skater",
    stats,
  };
}
