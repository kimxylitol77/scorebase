// 리그별 시즌 리더보드 fetch — 매일 1회 cron.
//
// Phase 1 (이번 commit): 축구 7개 리그
//   득점 / 도움 / 옐로카드 / 레드카드 TOP 10 (API-Football)
//
// Phase 2 (다음 commit): KBO/NPB/MLB · NBA · NHL · LOL

import "@/lib/env";
import { prisma } from "@/lib/db";
import {
  fetchSeasonTopScorers,
  fetchTopAssists,
  fetchTopYellowCards,
  fetchTopRedCards,
  type PlayerLeaderEntry,
  type TopScorerEntry,
} from "@/lib/sports/api-football-pro";
import { toKoreanTeamName } from "@/lib/team-names";
import { toKoreanPlayerName } from "@/lib/player-names";

const SOCCER_LEAGUES = [
  "EPL",
  "LALIGA",
  "BUNDESLIGA",
  "SERIE_A",
  "LIGUE_1",
  "MLS",
  "UCL",
  "WORLD_CUP",
];

const TOP_N = 10;

/** 시즌 식별 — 축구는 시즌 시작 연도 (예: 2025-26 → 2025). KST 7월 기준. */
function currentSoccerSeason(): { season: number; label: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  // 7월 이전이면 전년도 시즌
  const startYear = m >= 7 ? y : y - 1;
  return { season: startYear, label: `${startYear}-${String(startYear + 1).slice(2)}` };
}

interface UpsertInput {
  league: string;
  category: string;
  rank: number;
  playerName: string;
  playerNameEn?: string;
  externalId?: string;
  teamName: string;
  value: number;
  unit?: string;
  appearances?: number;
  photoUrl?: string;
  season: string;
}

async function upsertLeader(d: UpsertInput) {
  await prisma.leagueLeader.upsert({
    where: {
      league_category_rank_season: {
        league: d.league,
        category: d.category,
        rank: d.rank,
        season: d.season,
      },
    },
    update: {
      playerName: d.playerName,
      playerNameEn: d.playerNameEn,
      externalId: d.externalId,
      teamName: d.teamName,
      value: d.value,
      unit: d.unit,
      appearances: d.appearances,
      photoUrl: d.photoUrl,
      fetchedAt: new Date(),
    },
    create: d,
  });
}

async function clearOldRanks(
  league: string,
  category: string,
  season: string,
  keepFromRank: number,
) {
  // TOP_N 줄어드는 경우 (예: 시즌 초반 데이터 부족) 기존 row 정리
  await prisma.leagueLeader.deleteMany({
    where: {
      league,
      category,
      season,
      rank: { gt: keepFromRank },
    },
  });
}

async function syncSoccerCategory(
  league: string,
  category: "GOAL" | "ASSIST" | "YELLOW" | "RED",
  season: number,
  seasonLabel: string,
  fetcher: (league: string, season: number) => Promise<PlayerLeaderEntry[] | TopScorerEntry[]>,
  unit: string,
): Promise<number> {
  const raw = await fetcher(league, season);
  const top = raw.slice(0, TOP_N);
  for (let i = 0; i < top.length; i++) {
    const p = top[i] as PlayerLeaderEntry & { goals?: number; assists?: number };
    // TopScorerEntry 는 value 가 없음 — goals 추출
    const value =
      category === "GOAL" && "goals" in p
        ? p.goals ?? 0
        : (p as PlayerLeaderEntry).value;
    await upsertLeader({
      league,
      category,
      rank: i + 1,
      playerName: toKoreanPlayerName(p.playerName) || p.playerName,
      playerNameEn: p.playerName,
      externalId: p.playerId ? String(p.playerId) : undefined,
      teamName: toKoreanTeamName(p.teamName) || p.teamName,
      value,
      unit,
      appearances: p.appearances,
      photoUrl: p.photoUrl,
      season: seasonLabel,
    });
  }
  await clearOldRanks(league, category, seasonLabel, top.length);
  return top.length;
}

export async function runFetchLeagueLeaders() {
  const { season, label } = currentSoccerSeason();
  console.log(`[league-leaders] 시즌 ${label} (season=${season}) — 축구 ${SOCCER_LEAGUES.length}개 리그`);

  const summary: Record<string, Record<string, number>> = {};
  for (const lg of SOCCER_LEAGUES) {
    summary[lg] = {};
    try {
      summary[lg].GOAL = await syncSoccerCategory(
        lg,
        "GOAL",
        season,
        label,
        fetchSeasonTopScorers,
        "득점",
      );
      summary[lg].ASSIST = await syncSoccerCategory(
        lg,
        "ASSIST",
        season,
        label,
        fetchTopAssists,
        "도움",
      );
      summary[lg].YELLOW = await syncSoccerCategory(
        lg,
        "YELLOW",
        season,
        label,
        fetchTopYellowCards,
        "옐로",
      );
      summary[lg].RED = await syncSoccerCategory(
        lg,
        "RED",
        season,
        label,
        fetchTopRedCards,
        "레드",
      );
      console.log(
        `[league-leaders] ${lg} — GOAL ${summary[lg].GOAL} · ASSIST ${summary[lg].ASSIST} · YELLOW ${summary[lg].YELLOW} · RED ${summary[lg].RED}`,
      );
    } catch (e) {
      console.warn(`[league-leaders] ${lg} 실패:`, (e as Error).message);
    }
  }
  return { season: label, summary };
}
