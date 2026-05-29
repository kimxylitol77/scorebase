// NBA 플레이오프 브라켓 — TheSports 소스.
//
// 기존 nba-playoffs.ts 는 ESPN scoreboard raw(series.type=playoff)에 의존했으나,
// NBA 매치 수집이 api-sports 로 바뀌면서 series 메타데이터가 사라져 브라켓이 stale 됨.
// TheSports basketball 은 플레이오프 라운드 정보를 stage 로 제공하므로 이를 단일 소스로 사용.
//
// 데이터 흐름:
//   1) competition/list → NBA 현재 season_id (cur_season_id)
//   2) stage/list → 현재 시즌 플레이오프 stage_id → 라운드/컨퍼런스 (예: "East Finals")
//   3) season/recent → 플레이오프 매치(kind=2) 날짜 수집 (1콜)
//   4) match/diary(날짜별) → 매치별 stage_id + 쿼터 스코어 + status + 시드
//   5) tsId → 우리 Team.id (basketball-team-id-mapping.json) 매핑 후 시리즈 그룹화
//
// 출력은 nba-playoffs.ts 의 NbaPlayoffSeries[] 와 동일 — 컴포넌트/시뮬레이션 그대로 재사용.

import axios from "axios";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { mapBasketballStatus } from "@/lib/sports/thesports/status-codes";
import bbMapping from "@/lib/sports/thesports/basketball-team-id-mapping.json";
import type {
  NbaPlayoffSeries,
  NbaRound,
  NbaConference,
  NbaSeriesGame,
} from "./nba-playoffs";

const TS_BASE = "https://api.thesports.com";
const NBA_COMP = "49vjxm8xt4q6odg";
const FALLBACK_SEASON = "z8yomovt258q0j6";

interface BbMapEntry {
  ourId: number;
  ourName: string;
  ourLeague: string;
  tsId: string;
}

interface DiaryMatch {
  id: string;
  competition_id: string;
  home_team_id: string;
  away_team_id: string;
  kind: number;
  status_id: number;
  match_time: number;
  home_scores?: number[];
  away_scores?: number[];
  season_id?: string;
  round?: { stage_id?: string };
}

async function tsGet<T = unknown>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const user = process.env.THESPORTS_USER;
  const secret = process.env.THESPORTS_SECRET;
  if (!user || !secret) throw new Error("THESPORTS creds missing");
  const { data } = await axios.get(`${TS_BASE}${path}`, {
    params: { user, secret, ...params },
    timeout: 20_000,
  });
  return data as T;
}

/** TheSports stage 이름 → 우리 라운드/컨퍼런스. NBA Cup(시즌 중 토너먼트)은 제외. */
function stageToRound(
  name: string,
): { round: NbaRound; conference: NbaConference } | null {
  const h = name.trim().toLowerCase();
  if (/nba cup|cup /.test(h)) return null; // 시즌 중 토너먼트 — 플레이오프 아님
  let round: NbaRound | null = null;
  if (/1st round|first round/.test(h)) round = "FIRST_ROUND";
  else if (/semifinals|semi-finals/.test(h)) round = "CONF_SEMIS";
  else if (/^(east|west)\s+finals/.test(h)) round = "CONF_FINALS";
  else if (/^finals$/.test(h)) round = "FINALS";
  if (!round) return null;
  let conference: NbaConference = null;
  if (round !== "FINALS") {
    if (/east/.test(h)) conference = "EAST";
    else if (/west/.test(h)) conference = "WEST";
  }
  return { round, conference };
}

function scoreSum(arr: number[] | undefined): number | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr.reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);
}

async function buildBracket(): Promise<NbaPlayoffSeries[]> {
  // 1) 현재 시즌 id
  let seasonId = FALLBACK_SEASON;
  try {
    const comp = await tsGet<{ results?: Array<{ id: string; cur_season_id?: string }> }>(
      "/v1/basketball/competition/list",
      {},
    );
    const nba = comp.results?.find((c) => c.id === NBA_COMP);
    if (nba?.cur_season_id) seasonId = nba.cur_season_id;
  } catch {
    // fallback 상수 사용
  }

  // 2) stage_id → 라운드/컨퍼런스
  const stageInfo = new Map<string, { round: NbaRound; conference: NbaConference }>();
  try {
    const st = await tsGet<{ results?: Array<{ id: string; season_id: string; name: string }> }>(
      "/v1/basketball/stage/list",
      {},
    );
    for (const s of st.results ?? []) {
      if (s.season_id !== seasonId) continue;
      const info = stageToRound(s.name);
      if (info) stageInfo.set(s.id, info);
    }
  } catch {
    return [];
  }
  if (stageInfo.size === 0) return [];

  // 3) 플레이오프 매치 날짜 수집 (kind=2, 최근 70일 ~ +14일 — NBA Cup 제외용 날짜 필터)
  const nowSec = Math.floor(Date.now() / 1000);
  const minSec = nowSec - 70 * 86400;
  const maxSec = nowSec + 14 * 86400;
  const dates = new Set<string>();
  try {
    const sr = await tsGet<{ results?: DiaryMatch[] }>(
      "/v1/basketball/match/season/recent",
      { uuid: seasonId },
    );
    for (const m of sr.results ?? []) {
      if (m.kind !== 2) continue;
      if (m.match_time < minSec || m.match_time > maxSec) continue;
      dates.add(new Date(m.match_time * 1000).toISOString().slice(0, 10).replace(/-/g, ""));
    }
  } catch {
    return [];
  }
  if (dates.size === 0) return [];

  // 4) 날짜별 diary → 매치별 stage_id (병렬)
  const diaryMatches: DiaryMatch[] = [];
  const dateList = [...dates];
  const CHUNK = 8;
  for (let i = 0; i < dateList.length; i += CHUNK) {
    const slice = dateList.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map((date) =>
        tsGet<{ results?: DiaryMatch[] }>("/v1/basketball/match/diary", { date })
          .then((d) => d.results ?? [])
          .catch(() => [] as DiaryMatch[]),
      ),
    );
    for (const arr of results) {
      for (const m of arr) {
        if (m.competition_id !== NBA_COMP) continue;
        if (!m.round?.stage_id || !stageInfo.has(m.round.stage_id)) continue;
        diaryMatches.push(m);
      }
    }
  }
  if (diaryMatches.length === 0) return [];

  // 5) tsId → 우리 Team
  const tsToOur = new Map<string, BbMapEntry>();
  for (const e of bbMapping as BbMapEntry[]) {
    if (e.ourLeague === "NBA") tsToOur.set(e.tsId, e);
  }
  const ourIds = new Set<number>();
  for (const m of diaryMatches) {
    const h = tsToOur.get(m.home_team_id);
    const a = tsToOur.get(m.away_team_id);
    if (h) ourIds.add(h.ourId);
    if (a) ourIds.add(a.ourId);
  }
  const teamRows = await prisma.team.findMany({
    where: { id: { in: [...ourIds] } },
    select: { id: true, name: true, shortName: true, logoUrl: true },
  });
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  // 6) 시리즈 그룹화 — stage_id + 정렬된 팀쌍
  interface SeriesAcc {
    round: NbaRound;
    conference: NbaConference;
    t1: number; // 우리 Team.id (작은 쪽)
    t2: number;
    t1Wins: number;
    t2Wins: number;
    games: NbaSeriesGame[];
  }
  const seriesMap = new Map<string, SeriesAcc>();
  for (const m of diaryMatches) {
    const info = stageInfo.get(m.round!.stage_id!)!;
    const h = tsToOur.get(m.home_team_id);
    const a = tsToOur.get(m.away_team_id);
    if (!h || !a || !teamById.has(h.ourId) || !teamById.has(a.ourId)) continue;
    const status = mapBasketballStatus(m.status_id);
    const homeScore = status === "SCHEDULED" ? null : scoreSum(m.home_scores);
    const awayScore = status === "SCHEDULED" ? null : scoreSum(m.away_scores);

    const [t1, t2] = h.ourId < a.ourId ? [h.ourId, a.ourId] : [a.ourId, h.ourId];
    const key = `${m.round!.stage_id}:${t1}-${t2}`;
    let acc = seriesMap.get(key);
    if (!acc) {
      acc = { round: info.round, conference: info.conference, t1, t2, t1Wins: 0, t2Wins: 0, games: [] };
      seriesMap.set(key, acc);
    }
    acc.games.push({
      matchId: 0,
      date: new Date(m.match_time * 1000),
      homeTeamId: h.ourId,
      awayTeamId: a.ourId,
      homeScore,
      awayScore,
      status,
    });
    // 승수 집계 — FINISHED 게임만
    if (status === "FINISHED" && homeScore != null && awayScore != null && homeScore !== awayScore) {
      const winnerOur = homeScore > awayScore ? h.ourId : a.ourId;
      if (winnerOur === t1) acc.t1Wins++;
      else acc.t2Wins++;
    }
  }

  // 7) NbaPlayoffSeries[] 로 변환
  const result: NbaPlayoffSeries[] = [];
  for (const acc of seriesMap.values()) {
    const team1Row = teamById.get(acc.t1)!;
    const team2Row = teamById.get(acc.t2)!;
    acc.games.sort((g1, g2) => g1.date.getTime() - g2.date.getTime());
    const completed = acc.t1Wins >= 4 || acc.t2Wins >= 4;
    const lead = acc.t1Wins === acc.t2Wins ? null : acc.t1Wins > acc.t2Wins ? team1Row : team2Row;
    const hi = Math.max(acc.t1Wins, acc.t2Wins);
    const lo = Math.min(acc.t1Wins, acc.t2Wins);
    const leadShort = lead?.shortName || lead?.name || "";
    const summary = completed
      ? `${leadShort} 시리즈 승리 ${hi}-${lo}`
      : lead
        ? `${leadShort} ${hi}-${lo} 리드`
        : acc.t1Wins > 0
          ? `${acc.t1Wins}-${acc.t2Wins} 동률`
          : "";
    result.push({
      round: acc.round,
      conference: acc.conference,
      team1: { id: team1Row.id, name: team1Row.name, shortName: team1Row.shortName, logoUrl: team1Row.logoUrl, wins: acc.t1Wins },
      team2: { id: team2Row.id, name: team2Row.name, shortName: team2Row.shortName, logoUrl: team2Row.logoUrl, wins: acc.t2Wins },
      completed,
      totalGames: 7,
      summary,
      games: acc.games,
    });
  }
  return result;
}

/** TheSports NBA 플레이오프 브라켓 (5분 캐시). 실패 시 빈 배열. */
export const getTsNbaPlayoffBracket = unstable_cache(
  async (): Promise<NbaPlayoffSeries[]> => {
    try {
      return await buildBracket();
    } catch {
      return [];
    }
  },
  ["ts-nba-playoff-bracket"],
  { revalidate: 300, tags: ["ts-nba-playoff"] },
);
