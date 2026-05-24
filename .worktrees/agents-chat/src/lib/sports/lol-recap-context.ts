// LoL RECAP 통합 context builder.
// BDL matches → match_maps → player_match_map_stats + team_match_map_stats 체인 호출 후
// MVP/LVP 선정, 타임라인 생성, 시즌 누적, 다음 매치 정보, Quote 자동 생성까지.

import axios from "axios";
import { prisma } from "@/lib/db";
import {
  fetchBdlMatchMaps,
  calcLckStandings,
  fetchCurrentLolPatch,
  findNextMatchForTeam,
  type BdlMatchMap,
  type BdlPlayerMatchMapStat,
  type BdlTeamMatchMapStat,
} from "./lol";
import { getKoreanStarBy } from "./star-players";
import {
  selectMvpLvp,
  type MvpCandidate,
} from "./lol-mvp-selector";
import { buildGameTimeline, type TimelineEvent } from "./lol-timeline";
import { pickMatchQuote, type MatchQuote } from "./lol-match-quote";

const BDL_BASE = "https://api.balldontlie.io/lol/v1";

function authHeader(): Record<string, string> {
  const key = process.env.BALLDONTLIE_KEY;
  return key ? { Authorization: key } : {};
}

// BDL rate limit (429) 회피 — 점진 backoff 재시도.
async function getWithRetry<T>(
  url: string,
  params: Record<string, unknown>,
): Promise<T[]> {
  const backoffs = [3000, 8000, 20000, 45000];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      const { data } = await axios.get<{ data: T[] }>(url, {
        params,
        headers: authHeader(),
        timeout: 12000,
      });
      return data.data ?? [];
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 429 && attempt < backoffs.length) {
        await new Promise((r) => setTimeout(r, backoffs[attempt]));
        continue;
      }
      return [];
    }
  }
  return [];
}

async function fetchPlayerStatsForMap(
  matchMapId: number,
): Promise<BdlPlayerMatchMapStat[]> {
  return getWithRetry<BdlPlayerMatchMapStat>(
    `${BDL_BASE}/player_match_map_stats`,
    { match_map_id: matchMapId, per_page: 20 },
  );
}

async function fetchTeamStatsForMap(
  matchMapId: number,
): Promise<BdlTeamMatchMapStat[]> {
  return getWithRetry<BdlTeamMatchMapStat>(
    `${BDL_BASE}/team_match_map_stats`,
    { match_map_id: matchMapId, per_page: 10 },
  );
}

/* =====================================================================
 * Output shape — page 컴포넌트 + prompt 양쪽에서 쓰는 풍부한 context
 * ===================================================================*/

export interface LolRecapGameContext {
  gameNumber: number;
  durationSec: number;
  winner: "team1" | "team2";
  team1: {
    teamExternalId: string;
    side?: string;
    kills: number;
    deaths: number;
    assists: number;
    goldEarned?: number;
    dragonKills?: number;
    baronKills?: number;
    heraldKills?: number;
    firstBlood?: boolean;
    firstTower?: boolean;
    firstDragon?: boolean;
    firstBaron?: boolean;
  };
  team2: { /* same shape */
    teamExternalId: string;
    side?: string;
    kills: number;
    deaths: number;
    assists: number;
    goldEarned?: number;
    dragonKills?: number;
    baronKills?: number;
    heraldKills?: number;
    firstBlood?: boolean;
    firstTower?: boolean;
    firstDragon?: boolean;
    firstBaron?: boolean;
  };
  players: MvpCandidate[]; // 10명 (MVP/LVP flag 포함)
  mvpBdlPlayerId: number;
  lvpBdlPlayerId: number;
  timeline: TimelineEvent[];
}

export interface LolRecapNextMatch {
  matchExternalId: string;
  startDateIso: string;
  opponentNameKo: string;
  opponentExternalId: string;
  homeAway: "home" | "away";
  /** 우리 모델 1X2 home/away (LoL 무승부 X) */
  modelWinProb?: { home: number; away: number };
  /** 기존 발행된 PREVIEW 글 slug (있을 때만) */
  previewSlug?: string;
}

export interface LolRecapContext {
  match: {
    league: "LOL";
    matchExternalId: string;
    startDateIso: string;
    team1NameKo: string;
    team2NameKo: string;
    team1Score: number;
    team2Score: number;
    boType?: number;
    seriesScore: string;
    winnerNameKo: string;
    loserNameKo: string;
    patch?: string;
    tournamentName: string;
  };
  games: LolRecapGameContext[];
  seasonContext: {
    team1: {
      wins: number;
      losses: number;
      rank: number;
      total: number;
      setsWon: number;
      setsLost: number;
      twoZeroCount: number;
      twoZeroReceived: number;
      winStreak: number;
      loseStreak: number;
      recent5: Array<"W" | "L">;
    };
    team2: {
      wins: number;
      losses: number;
      rank: number;
      total: number;
      setsWon: number;
      setsLost: number;
      twoZeroCount: number;
      twoZeroReceived: number;
      winStreak: number;
      loseStreak: number;
      recent5: Array<"W" | "L">;
    };
  };
  nextMatch: {
    team1: LolRecapNextMatch | null;
    team2: LolRecapNextMatch | null;
  };
  quote: MatchQuote;
  starPlayersInMatch: string[]; // 본문 등장한 한국 슈퍼스타 이름 (예: ["페이커", "케리아"])
}

/* =====================================================================
 * Builder — 우리 DB Match 1개에서 BDL 호출 → 풍부한 context
 * ===================================================================*/

interface DbMatchInput {
  externalId: string; // BDL match id
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: number; name: string; externalId: string };
  awayTeam: { id: number; name: string; externalId: string };
  raw?: string | null;
}

function koTeamName(name: string): string {
  // 우리 lol.ts collector 가 이미 한국명을 저장. 그대로 사용.
  return name;
}

export async function buildLolRecapContext(
  match: DbMatchInput,
): Promise<LolRecapContext | null> {
  if (match.homeScore === null || match.awayScore === null) return null;

  // 1) BDL 매치의 게임들 fetch
  const maps = await fetchBdlMatchMaps(match.externalId);
  const finishedMaps: BdlMatchMap[] = maps.filter(
    (mp) => mp.winner && mp.winner.id,
  );
  // 게임 번호 오름차순
  finishedMaps.sort((a, b) => (a.game_number ?? 0) - (b.game_number ?? 0));

  // 2) 각 게임의 player_stats + team_stats 병렬 fetch
  const games: LolRecapGameContext[] = [];
  const homeBdlTeamId = Number(match.homeTeam.externalId);

  for (const mp of finishedMaps) {
    // BDL burst 제한 회피 — 순차 호출 + 호출 간 sleep 1.5s
    const playerStats = await fetchPlayerStatsForMap(mp.id);
    await new Promise((r) => setTimeout(r, 1500));
    const teamStats = await fetchTeamStatsForMap(mp.id);
    await new Promise((r) => setTimeout(r, 1500));
    if (playerStats.length === 0 || teamStats.length < 2) continue;

    // team_stats 양 팀 분리
    const t1Stat = teamStats.find((s) => s.team?.id === homeBdlTeamId);
    const t2Stat = teamStats.find((s) => s.team?.id !== homeBdlTeamId);
    if (!t1Stat || !t2Stat) continue;

    const durationSec = mp.duration ?? 1800;
    const winnerSide: "team1" | "team2" =
      mp.winner?.id === homeBdlTeamId ? "team1" : "team2";

    // MVP/LVP 선정
    const teamKillsT1 = t1Stat.kills;
    const teamKillsT2 = t2Stat.kills;
    const playerRawStats = playerStats.map((p) => {
      const side: "team1" | "team2" =
        p.team?.id === homeBdlTeamId ? "team1" : "team2";
      const isWinning = side === winnerSide;
      const teamKills = side === "team1" ? teamKillsT1 : teamKillsT2;
      return {
        bdlPlayerId: p.player?.id ?? 0,
        team: side,
        isWinningTeam: isWinning,
        nickname: p.player?.nickname ?? "",
        role: p.role ?? "",
        champion: p.champion?.name ?? "",
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        assists: p.assists ?? 0,
        cs: p.creep_score ?? 0,
        goldEarned: p.gold_earned ?? 0,
        goldPerMin: p.gold_per_min,
        damageToChamps: p.total_damage_dealt_to_champions ?? 0,
        killParticipation: p.kill_participation,
        durationSec,
        teamKills,
      };
    });
    const { mvp, lvp, all: mvpAll } = selectMvpLvp(playerRawStats);

    // 타임라인
    const timeline = buildGameTimeline(
      {
        first_blood: t1Stat.first_blood,
        first_tower: t1Stat.first_tower,
        first_dragon: t1Stat.first_dragon,
        first_baron: t1Stat.first_baron,
        dragon_kills: t1Stat.dragon_kills,
        baron_kills: t1Stat.baron_kills,
        herald_kills: t1Stat.herald_kills,
      },
      {
        first_blood: t2Stat.first_blood,
        first_tower: t2Stat.first_tower,
        first_dragon: t2Stat.first_dragon,
        first_baron: t2Stat.first_baron,
        dragon_kills: t2Stat.dragon_kills,
        baron_kills: t2Stat.baron_kills,
        herald_kills: t2Stat.herald_kills,
      },
      durationSec,
      winnerSide,
    );

    games.push({
      gameNumber: mp.game_number ?? games.length + 1,
      durationSec,
      winner: winnerSide,
      team1: {
        teamExternalId: match.homeTeam.externalId,
        side: t1Stat.color,
        kills: t1Stat.kills,
        deaths: t1Stat.deaths,
        assists: t1Stat.assists,
        goldEarned: t1Stat.gold_earned,
        dragonKills: t1Stat.dragon_kills,
        baronKills: t1Stat.baron_kills,
        heraldKills: t1Stat.herald_kills,
        firstBlood: !!t1Stat.first_blood,
        firstTower: !!t1Stat.first_tower,
        firstDragon: !!t1Stat.first_dragon,
        firstBaron: !!t1Stat.first_baron,
      },
      team2: {
        teamExternalId: match.awayTeam.externalId,
        side: t2Stat.color,
        kills: t2Stat.kills,
        deaths: t2Stat.deaths,
        assists: t2Stat.assists,
        goldEarned: t2Stat.gold_earned,
        dragonKills: t2Stat.dragon_kills,
        baronKills: t2Stat.baron_kills,
        heraldKills: t2Stat.herald_kills,
        firstBlood: !!t2Stat.first_blood,
        firstTower: !!t2Stat.first_tower,
        firstDragon: !!t2Stat.first_dragon,
        firstBaron: !!t2Stat.first_baron,
      },
      players: mvpAll,
      mvpBdlPlayerId: mvp.bdlPlayerId,
      lvpBdlPlayerId: lvp.bdlPlayerId,
      timeline,
    });
  }

  // 3) 시즌 누적 (이 매치 결과 포함 전체 LCK FINISHED)
  const lckMatches = await prisma.match.findMany({
    where: { league: "LOL" },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const standings = calcLckStandings(lckMatches);
  const total = standings.size;
  const t1Std = standings.get(match.homeTeamId);
  const t2Std = standings.get(match.awayTeamId);

  // 4) 다음 매치 — 양 팀 각각
  const scheduledMatches = await prisma.match.findMany({
    where: {
      league: "LOL",
      status: "SCHEDULED",
      startTime: { gte: new Date() },
      OR: [
        { homeTeamId: match.homeTeamId },
        { awayTeamId: match.homeTeamId },
        { homeTeamId: match.awayTeamId },
        { awayTeamId: match.awayTeamId },
      ],
    },
    select: {
      externalId: true,
      startTime: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeTeam: { select: { externalId: true, name: true } },
      awayTeam: { select: { externalId: true, name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  async function nextFor(teamDbId: number): Promise<LolRecapNextMatch | null> {
    const info = findNextMatchForTeam(teamDbId, scheduledMatches);
    if (!info) return null;
    // opponent 한국명 — DB 에서 직접
    const next = scheduledMatches.find(
      (s) => s.externalId === info.matchExternalId,
    );
    if (!next) return null;
    const opponentName =
      next.homeTeamId === teamDbId ? next.awayTeam.name : next.homeTeam.name;
    // 기존 PREVIEW 글 매칭 (matchId 로 검색)
    const matchRow = await prisma.match.findFirst({
      where: { externalId: info.matchExternalId, league: "LOL" },
      select: {
        marketHome: true,
        marketAway: true,
        articles: {
          where: { type: "PREVIEW", status: "PUBLISHED" },
          select: { slug: true },
          take: 1,
        },
      },
    });
    return {
      matchExternalId: info.matchExternalId,
      startDateIso: info.startTime.toISOString(),
      opponentNameKo: opponentName,
      opponentExternalId: info.opponentTeamExternalId,
      homeAway: info.homeAway,
      modelWinProb:
        matchRow?.marketHome != null && matchRow?.marketAway != null
          ? {
              home: matchRow.marketHome,
              away: matchRow.marketAway,
            }
          : undefined,
      previewSlug: matchRow?.articles?.[0]?.slug,
    };
  }
  const t1Next = await nextFor(match.homeTeamId);
  const t2Next = await nextFor(match.awayTeamId);

  // 5) Quote 자동 생성
  const winnerNameKo =
    match.homeScore > match.awayScore ? match.homeTeam.name : match.awayTeam.name;
  const loserNameKo =
    match.homeScore > match.awayScore ? match.awayTeam.name : match.homeTeam.name;
  const scoreStr = `${match.homeScore}-${match.awayScore}`;
  const allGamePlayers = games.flatMap((g) => g.players);
  const winnerStd =
    match.homeScore > match.awayScore ? t1Std : t2Std;
  const quote = pickMatchQuote({
    allPlayers: allGamePlayers,
    winnerNameKo,
    loserNameKo,
    scoreStr,
    winnerSeason: winnerStd
      ? {
          wins: winnerStd.wins,
          losses: winnerStd.losses,
          rank: winnerStd.rank,
          twoZeroCount: winnerStd.twoZeroCount,
          winStreak: winnerStd.winStreak,
        }
      : undefined,
  });

  // 6) star players in match (본문에 등장한 한국 슈퍼스타)
  const starsSet = new Set<string>();
  for (const p of allGamePlayers) {
    const star = getKoreanStarBy(p.playerName);
    if (star) starsSet.add(star.koreanName);
  }

  // 7) patch (cached)
  const patch = await fetchCurrentLolPatch();

  // 8) tournamentName — raw 에서 추출
  let tournamentName = "LCK";
  if (match.raw) {
    try {
      const r = JSON.parse(match.raw);
      tournamentName = r?.tournament?.name ?? "LCK";
    } catch {}
  }

  return {
    match: {
      league: "LOL",
      matchExternalId: match.externalId,
      startDateIso: match.startTime.toISOString(),
      team1NameKo: koTeamName(match.homeTeam.name),
      team2NameKo: koTeamName(match.awayTeam.name),
      team1Score: match.homeScore,
      team2Score: match.awayScore,
      seriesScore: scoreStr,
      winnerNameKo,
      loserNameKo,
      patch: patch ?? undefined,
      tournamentName,
    },
    games,
    seasonContext: {
      team1: {
        wins: t1Std?.wins ?? 0,
        losses: t1Std?.losses ?? 0,
        rank: t1Std?.rank ?? total,
        total,
        setsWon: t1Std?.setsWon ?? 0,
        setsLost: t1Std?.setsLost ?? 0,
        twoZeroCount: t1Std?.twoZeroCount ?? 0,
        twoZeroReceived: t1Std?.twoZeroReceived ?? 0,
        winStreak: t1Std?.winStreak ?? 0,
        loseStreak: t1Std?.loseStreak ?? 0,
        recent5: t1Std?.recent5 ?? [],
      },
      team2: {
        wins: t2Std?.wins ?? 0,
        losses: t2Std?.losses ?? 0,
        rank: t2Std?.rank ?? total,
        total,
        setsWon: t2Std?.setsWon ?? 0,
        setsLost: t2Std?.setsLost ?? 0,
        twoZeroCount: t2Std?.twoZeroCount ?? 0,
        twoZeroReceived: t2Std?.twoZeroReceived ?? 0,
        winStreak: t2Std?.winStreak ?? 0,
        loseStreak: t2Std?.loseStreak ?? 0,
        recent5: t2Std?.recent5 ?? [],
      },
    },
    nextMatch: { team1: t1Next, team2: t2Next },
    quote,
    starPlayersInMatch: [...starsSet],
  };
}
