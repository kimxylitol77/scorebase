// 포스트시즌 선수 통계 페이지(한국어 /baseball/postseason/stats · 영어 /en/baseball/postseason/stats) 공용 — 파라미터 해석·시즌 고르기·정본 경로.
import { BB_LEAGUES, type BbLeague, type BbPlayerRow, type BbRole } from "./player-rankings";
import type { AdvancedInput, StatUnit } from "./stats-table";
import { getMlbPostseasonStats } from "./mlb-postseason-stats";
import { getArchivePostseason, getArchivePostseasonSeasons } from "./postseason-archive";
import { currentMlbSeason } from "@/lib/sports/mlb-postseason";

/** 시즌 버튼 개수 — 기록이 있는 가장 최근 시즌부터 */
const SEASON_COUNT = 5;
export type PsSP = Record<string, string | undefined>;

export interface PsData { bat: BbPlayerRow[]; pit: BbPlayerRow[]; minIp: number; adv?: AdvancedInput }

export function parse(sp: PsSP) {
  const league: BbLeague = (BB_LEAGUES as string[]).includes(sp.league ?? "") ? (sp.league as BbLeague) : "MLB";
  const role: BbRole = sp.role === "pit" ? "pit" : "bat";
  const unit: StatUnit = sp.unit === "pergame" ? "pergame" : "total";
  return { league, role, unit };
}

/** 올해 포스트시즌 기록이 생기기 전엔 지난 시즌이 최신. 요청 시즌이 목록 밖이면 최신. */
export async function resolveSeason(league: BbLeague, sp: PsSP): Promise<{ current: number; latest: number; seasons: number[]; season: number; data: PsData | null }> {
  const asked = Number(sp.season);
  if (league === "MLB") {
    const current = currentMlbSeason();
    const currentData = await getMlbPostseasonStats(current);
    const latest = currentData ? current : current - 1;
    const seasons = Array.from({ length: SEASON_COUNT }, (_, i) => latest - i);
    const season = seasons.includes(asked) ? asked : latest;
    const data = season === current ? currentData : await getMlbPostseasonStats(season);
    return { current, latest, seasons, season, data };
  }
  const current = new Date().getFullYear(); // KBO·NPB 는 달력 연도 시즌
  const saved = (await getArchivePostseasonSeasons(league).catch(() => [])).slice(0, SEASON_COUNT);
  const latest = saved[0] ?? current - 1;
  const seasons = saved.length ? saved : [latest];
  const season = seasons.includes(asked) ? asked : latest;
  return { current, latest, seasons, season, data: await getArchivePostseason(league, season).catch(() => null) };
}

/** 정본 — 기본값(최신 시즌·타자)은 빼서 최신 타자 표는 "?league=KBO" 하나로 */
export const canonicalOf = (league: BbLeague, season: number, latest: number, role: BbRole, base = "/baseball/postseason/stats") =>
  `${base}?league=${league}${season === latest ? "" : `&season=${season}`}${role === "pit" ? "&role=pit" : ""}`;

