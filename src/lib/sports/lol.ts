// LCK (League of Legends Champions Korea) collector.
// 데이터 소스: BALLDONTLIE LoL API (https://api.balldontlie.io/lol/v1)
// GOAT plan 으로 e스포츠 endpoint unlock.
//
// LCK 매치는 BO(Best-of) 시리즈 — homeScore/awayScore 에 세트 점수(0/1/2/3) 저장.
// home/away 개념이 없어 BALLDONTLIE 의 team1=home, team2=away 로 매핑.

import axios from "axios";
import type {
  League,
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE = "https://api.balldontlie.io/lol/v1";

// BDL tournament id → 우리 League 코드 (단일 진실). "LOL"=LCK 본선(코드 유지).
// 2군·해외 리그는 여기에만 추가하면 fetchLolAll/collect 가 자동 분기한다.
//   324=LCK 2026 본선, 31757=Road to MSI (둘 다 "LOL"=LCK), 30626=LCK CL(2군).
//   (Stage 2: 19349/35115=LPL, 328/336=LEC, 323/337=LCS)
// export — collect(fetchLolAll) 와 live-scores(fetchLolLive) 가 같은 매핑을 공유(단일 소스).
export const TOURNAMENT_TO_LEAGUE: Record<number, League> = {
  324: "LOL",
  31757: "LOL",
  30626: "LCK_CL",
  // Stage 2 해외 — 19349/35115=LPL(중국), 328/336=LEC(유럽), 323/337=LCS(북미). 라이브 추적 포함.
  19349: "LPL",
  35115: "LPL",
  328: "LEC",
  336: "LEC",
  323: "LCS",
  337: "LCS",
};
export const LOL_TOURNAMENT_IDS = Object.keys(TOURNAMENT_TO_LEAGUE).map(Number);

// LCK 10팀 한글명 + 로고 매핑 (BALLDONTLIE team id 기준).
// 새 시즌에 팀 ID가 바뀌면 추가/수정. logo URL 은 Liquipedia hotlink (600px).
const LCK_TEAM_NAMES_KO: Record<
  string,
  { name: string; short: string; logo?: string }
> = {
  "1": {
    name: "T1",
    short: "T1",
    logo: "https://liquipedia.net/commons/images/thumb/f/f0/T1_2019_full_allmode.png/600px-T1_2019_full_allmode.png",
  },
  "2": {
    name: "Gen.G",
    short: "GEN",
    logo: "https://liquipedia.net/commons/images/thumb/0/07/Gen.G_Esports_2026_allmode.png/600px-Gen.G_Esports_2026_allmode.png",
  },
  "7": {
    name: "한화생명e스포츠",
    short: "HLE",
    // thumb/600px 썸네일은 캐시 누락(404) → 원본 PNG 직접 사용
    logo: "https://liquipedia.net/commons/images/e/e8/Hanwha_Life_Esports_lightmode.png",
  },
  "8": {
    name: "KT 롤스터",
    short: "KT",
    logo: "https://liquipedia.net/commons/images/thumb/8/81/Kt_Rolster_2026_full_lightmode.png/600px-Kt_Rolster_2026_full_lightmode.png",
  },
  "21": {
    name: "디플러스 기아",
    short: "DK",
    logo: "https://liquipedia.net/commons/images/thumb/b/ba/Dplus_lightmode.png/600px-Dplus_lightmode.png",
  },
  "35": {
    name: "BNK 피어엑스",
    short: "BFX",
    // thumb/600px 썸네일 캐시 누락 → 원본 PNG 직접 사용
    logo: "https://liquipedia.net/commons/images/a/a8/FEARX_2025_full_allmode.png",
  },
  "62": {
    name: "농심 레드포스",
    short: "NS",
    logo: "https://liquipedia.net/commons/images/thumb/d/d8/NS_Redforce_allmode.png/600px-NS_Redforce_allmode.png",
  },
  "66": {
    name: "한진 브리온",
    short: "BRO",
    logo: "https://liquipedia.net/commons/images/thumb/8/8c/BRION_2023_full_lightmode.png/600px-BRION_2023_full_lightmode.png",
  },
  "320": {
    name: "DN SOOPers",
    short: "DNS",
    logo: "https://liquipedia.net/commons/images/thumb/0/0e/DN_SOOPers_full_allmode.png/600px-DN_SOOPers_full_allmode.png",
  },
  "321": {
    name: "DRX",
    short: "DRX",
    logo: "https://liquipedia.net/commons/images/thumb/0/0c/DRX_2026_lightmode.png/600px-DRX_2026_lightmode.png",
  },
};

interface BdlTeam {
  id: number;
  name: string;
  slug?: string;
}

interface BdlTournament {
  id: number;
  name: string;
  slug: string;
  status?: string;
  tier?: string;
}

interface BdlMatch {
  id: number;
  slug: string;
  tournament: BdlTournament;
  team1: BdlTeam | null;
  team2: BdlTeam | null;
  winner: BdlTeam | null;
  team1_score: number | null;
  team2_score: number | null;
  bo_type: number | null;
  status: string; // "upcoming" | "running" | "finished" 등
  start_date: string; // ISO UTC
  end_date: string | null;
}

interface BdlListResponse<T> {
  data: T[];
  meta?: { next_cursor?: number | null; per_page?: number };
}

function authHeader(): Record<string, string> {
  const key = process.env.BALLDONTLIE_KEY;
  return key ? { Authorization: key } : {};
}

function mapStatus(s: string): MatchStatus {
  const v = s.toLowerCase();
  if (v === "finished" || v === "completed") return "FINISHED";
  if (v === "running" || v === "live" || v === "in_progress") return "LIVE";
  if (v === "postponed" || v === "cancelled" || v === "canceled")
    return "POSTPONED";
  return "SCHEDULED";
}

/** LOL 계열 전체 tournament 매치 (LCK·LCK CL 등, cursor 페이지네이션). league 는 tournament 로 결정. */
export async function fetchLolAll(): Promise<NormalizedMatch[]> {
  const out: BdlMatch[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 10; i++) {
    const params: Record<string, unknown> = {
      "tournament_ids[]": LOL_TOURNAMENT_IDS,
      per_page: 100,
    };
    if (cursor) params.cursor = cursor;
    const { data } = await axios.get<BdlListResponse<BdlMatch>>(
      `${BASE}/matches`,
      {
        params,
        headers: authHeader(),
        timeout: 15000,
      },
    );
    const list = data?.data ?? [];
    out.push(...list);
    const next = data?.meta?.next_cursor ?? null;
    if (!next || list.length === 0) break;
    cursor = next;
  }

  return out
    // 양 팀 + name 필수 — 해외 리그는 미정(TBD) 팀이 name=null 로 오기도 해 upsert 에러 방지.
    .filter((m) => m.team1?.name && m.team2?.name)
    .map((m): NormalizedMatch => {
      const t1 = m.team1!;
      const t2 = m.team2!;
      const t1Ko = LCK_TEAM_NAMES_KO[String(t1.id)];
      const t2Ko = LCK_TEAM_NAMES_KO[String(t2.id)];
      return {
        // tournament → league (단일 소스). LCK 계열은 "LOL", 2군은 "LCK_CL" 등. 미매핑은 "LOL" fallback.
        league: TOURNAMENT_TO_LEAGUE[m.tournament?.id] ?? "LOL",
        externalId: String(m.id),
        homeTeam: {
          externalId: String(t1.id),
          name: t1Ko?.name ?? t1.name,
          shortName: t1Ko?.short,
          logoUrl: t1Ko?.logo,
        },
        awayTeam: {
          externalId: String(t2.id),
          name: t2Ko?.name ?? t2.name,
          shortName: t2Ko?.short,
          logoUrl: t2Ko?.logo,
        },
        homeScore: m.team1_score ?? undefined,
        awayScore: m.team2_score ?? undefined,
        status: mapStatus(m.status),
        startTime: new Date(m.start_date),
        raw: m,
      };
    });
}

/* =====================================================================
 * LoL 패치 버전 — Data Dragon 공식 versions API (캐시됨)
 * ===================================================================*/

const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";

let cachedPatch: { value: string; fetchedAt: number } | null = null;
const PATCH_TTL_MS = 6 * 60 * 60 * 1000; // 6시간

/** 현재 LoL 라이브 서버 패치 버전 (예: "16.9.1"). 실패 시 null. */
export async function fetchCurrentLolPatch(): Promise<string | null> {
  const now = Date.now();
  if (cachedPatch && now - cachedPatch.fetchedAt < PATCH_TTL_MS) {
    return cachedPatch.value;
  }
  try {
    const { data } = await axios.get<string[]>(DDRAGON_VERSIONS, {
      timeout: 8000,
    });
    if (Array.isArray(data) && data.length > 0) {
      cachedPatch = { value: data[0], fetchedAt: now };
      return data[0];
    }
  } catch {
    // 네트워크 실패 시 stale 캐시라도 반환
    if (cachedPatch) return cachedPatch.value;
  }
  return null;
}

/* =====================================================================
 * LCK 정규 standings — DB 매치 결과로 시리즈 단위 win-loss 집계
 * ===================================================================*/

export interface LckStanding {
  teamId: number;
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  rank: number; // 1-based, 승률 > 세트 격차 순
  /** 시즌 2-0 셧다운 횟수 (이긴 매치 중 2-0) */
  twoZeroCount: number;
  /** 2-0 으로 진 횟수 (받은 셧다운) */
  twoZeroReceived: number;
  /** 현재 연승 (연패면 0) */
  winStreak: number;
  /** 현재 연패 (연승이면 0) */
  loseStreak: number;
  /** 최근 5시리즈 결과 (가장 최근부터) */
  recent5: Array<"W" | "L">;
}

interface StandingsInputMatch {
  league: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
  startTime: Date;
}

/** LCK FINISHED 매치들에서 정규 순위 집계 + 시즌 누적 지표 (2-0 셧다운·streak·recent5). */
export function calcLckStandings(
  matches: StandingsInputMatch[],
  league: string = "LOL",
): Map<number, LckStanding> {
  // 1단계: 팀별 결과 시계열 누적 (시간순)
  interface TeamAccum {
    teamId: number;
    wins: number;
    losses: number;
    setsWon: number;
    setsLost: number;
    twoZeroCount: number;
    twoZeroReceived: number;
    /** 시간 desc 정렬용 — 가장 최근부터 W/L push */
    results: Array<{ result: "W" | "L"; setDiff: number; at: Date }>;
  }
  const acc = new Map<number, TeamAccum>();
  function init(id: number) {
    if (!acc.has(id))
      acc.set(id, {
        teamId: id,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        twoZeroCount: 0,
        twoZeroReceived: 0,
        results: [],
      });
  }
  const finishedMatches = matches
    .filter(
      (m) =>
        m.league === league &&
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null,
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  for (const m of finishedMatches) {
    init(m.homeTeamId);
    init(m.awayTeamId);
    const h = acc.get(m.homeTeamId)!;
    const a = acc.get(m.awayTeamId)!;
    const hs = m.homeScore!;
    const as = m.awayScore!;
    h.setsWon += hs;
    h.setsLost += as;
    a.setsWon += as;
    a.setsLost += hs;
    const isShutout = hs === 2 && as === 0;
    const isReverseShutout = as === 2 && hs === 0;
    if (hs > as) {
      h.wins += 1;
      a.losses += 1;
      h.results.push({ result: "W", setDiff: hs - as, at: m.startTime });
      a.results.push({ result: "L", setDiff: as - hs, at: m.startTime });
      if (isShutout) {
        h.twoZeroCount += 1;
        a.twoZeroReceived += 1;
      }
    } else if (as > hs) {
      a.wins += 1;
      h.losses += 1;
      h.results.push({ result: "L", setDiff: hs - as, at: m.startTime });
      a.results.push({ result: "W", setDiff: as - hs, at: m.startTime });
      if (isReverseShutout) {
        a.twoZeroCount += 1;
        h.twoZeroReceived += 1;
      }
    }
  }

  // 2단계: 정렬 (승률 → 세트 격차)
  const sorted = [...acc.values()].sort((x, y) => {
    const wpx = x.wins + x.losses > 0 ? x.wins / (x.wins + x.losses) : 0;
    const wpy = y.wins + y.losses > 0 ? y.wins / (y.wins + y.losses) : 0;
    if (wpy !== wpx) return wpy - wpx;
    return y.setsWon - y.setsLost - (x.setsWon - x.setsLost);
  });

  // 3단계: streak + recent5 + rank
  const out = new Map<number, LckStanding>();
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const recentDesc = [...t.results].reverse(); // 가장 최근부터
    const recent5 = recentDesc.slice(0, 5).map((r) => r.result);
    // streak — 가장 최근부터 같은 결과 연속
    let winStreak = 0;
    let loseStreak = 0;
    for (const r of recentDesc) {
      if (r.result === "W") {
        if (loseStreak > 0) break;
        winStreak++;
      } else {
        if (winStreak > 0) break;
        loseStreak++;
      }
    }
    out.set(t.teamId, {
      teamId: t.teamId,
      wins: t.wins,
      losses: t.losses,
      setsWon: t.setsWon,
      setsLost: t.setsLost,
      twoZeroCount: t.twoZeroCount,
      twoZeroReceived: t.twoZeroReceived,
      winStreak,
      loseStreak,
      recent5,
      rank: i + 1,
    });
  }
  return out;
}

/* =====================================================================
 * 한 팀의 다음 SCHEDULED 매치 1건 — RECAP 의 "다음 매치 미니 예고"용
 * ===================================================================*/

export interface NextMatchInfo {
  matchExternalId: string; // BDL match id
  startTime: Date;
  opponentTeamExternalId: string;
  /** "home" = teamId 가 홈 팀, "away" = 어웨이 */
  homeAway: "home" | "away";
}

interface NextMatchInputMatch {
  externalId: string;
  startTime: Date;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeTeam: { externalId: string };
  awayTeam: { externalId: string };
}

export function findNextMatchForTeam(
  teamId: number,
  schedule: NextMatchInputMatch[],
): NextMatchInfo | null {
  const now = Date.now();
  const candidates = schedule
    .filter(
      (m) =>
        m.status === "SCHEDULED" &&
        m.startTime.getTime() > now &&
        (m.homeTeamId === teamId || m.awayTeamId === teamId),
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const next = candidates[0];
  if (!next) return null;
  const isHome = next.homeTeamId === teamId;
  return {
    matchExternalId: next.externalId,
    startTime: next.startTime,
    opponentTeamExternalId: isHome
      ? next.awayTeam.externalId
      : next.homeTeam.externalId,
    homeAway: isHome ? "home" : "away",
  };
}

/* =====================================================================
 * BDL LoL — match_maps · player stats · team stats · champion meta
 * tournament_roster 가 LCK 2026 시즌 데이터를 미보유라 매치 → 게임 → 선수 chain 으로 활성 5인 자동 추출.
 * ===================================================================*/

export interface BdlMatchMap {
  id: number;
  match_id: number;
  game_number?: number;
  /** BDL 실제 응답 필드명 — winner / loser (winner_team 아님) */
  winner?: { id: number; name: string } | null;
  loser?: { id: number; name: string } | null;
  team1_id?: number;
  team2_id?: number;
  duration?: number; // seconds
  status?: string; // "finished" | "upcoming"
  begin_at?: string;
  end_at?: string;
}

interface BdlListMeta {
  next_cursor?: number | null;
  per_page?: number;
}

interface BdlListResp<T> {
  data: T[];
  meta?: BdlListMeta;
}

/** 한 매치(시리즈)의 모든 게임. match_id 필수. */
export async function fetchBdlMatchMaps(matchId: string | number): Promise<BdlMatchMap[]> {
  try {
    const { data } = await axios.get<BdlListResp<BdlMatchMap>>(
      `${BASE}/match_maps`,
      {
        params: { match_id: matchId, per_page: 10 },
        headers: authHeader(),
        timeout: 12000,
      },
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export interface BdlPlayerMatchMapStat {
  id: number;
  match_map_id: number;
  player: { id: number; nickname: string };
  team: { id: number; name: string };
  champion?: { id: number; name: string };
  role: string; // "top" | "jungle" | "mid" | "bot" | "support"
  level?: number;
  kills: number;
  deaths: number;
  assists: number;
  kill_participation?: number;
  creep_score?: number;
  gold_earned?: number;
  gold_per_min?: number;
  total_damage_dealt_to_champions?: number;
}

/** 단일 선수의 게임별 stats (player_id scalar 필수). */
export async function fetchBdlPlayerStats(
  playerId: number,
  limit = 50,
): Promise<BdlPlayerMatchMapStat[]> {
  const all: BdlPlayerMatchMapStat[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 3 && all.length < limit; i++) {
    try {
      const params: Record<string, unknown> = {
        player_id: playerId,
        per_page: Math.min(100, limit - all.length),
      };
      if (cursor) params.cursor = cursor;
      const { data } = await axios.get<BdlListResp<BdlPlayerMatchMapStat>>(
        `${BASE}/player_match_map_stats`,
        { params, headers: authHeader(), timeout: 12000 },
      );
      const rows = data.data ?? [];
      all.push(...rows);
      const nx = data.meta?.next_cursor ?? null;
      if (!nx || rows.length === 0) break;
      cursor = nx;
    } catch {
      break;
    }
  }
  return all;
}

export interface BdlTeamMatchMapStat {
  id: number;
  match_map_id: number;
  team: { id: number; name: string };
  enemy_team: { id: number; name: string };
  side?: number;
  color?: string;
  kills: number;
  deaths: number;
  assists: number;
  creep_score?: number;
  gold_earned?: number;
  total_damage_dealt_to_champions?: number;
  baron_kills?: number;
  dragon_kills?: number;
  herald_kills?: number;
  first_blood?: number;
  first_tower?: number;
  first_baron?: number;
  first_dragon?: number;
}

/** 팀의 게임별 통계 (team_id scalar 필수). */
export async function fetchBdlTeamStats(
  teamId: number,
  limit = 60,
): Promise<BdlTeamMatchMapStat[]> {
  const all: BdlTeamMatchMapStat[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 3 && all.length < limit; i++) {
    try {
      const params: Record<string, unknown> = {
        team_id: teamId,
        per_page: Math.min(100, limit - all.length),
      };
      if (cursor) params.cursor = cursor;
      const { data } = await axios.get<BdlListResp<BdlTeamMatchMapStat>>(
        `${BASE}/team_match_map_stats`,
        { params, headers: authHeader(), timeout: 12000 },
      );
      const rows = data.data ?? [];
      all.push(...rows);
      const nx = data.meta?.next_cursor ?? null;
      if (!nx || rows.length === 0) break;
      cursor = nx;
    } catch {
      break;
    }
  }
  return all;
}

export interface BdlChampionStat {
  id: number;
  champion: { id: number; name: string };
  games_count: number;
  picks_rate: number;
  win_rate: number;
  ban_rate: number;
  kda: number;
  avg_damage_dealt_to_champions: number;
  avg_gold_per_min: number;
  avg_creep_score: number;
}

/** 글로벌 챔피언 메타 (LCK 한정 필터 없음 — BDL 응답 그대로). */
export async function fetchBdlChampionStats(
  limit = 20,
): Promise<BdlChampionStat[]> {
  try {
    const { data } = await axios.get<BdlListResp<BdlChampionStat>>(
      `${BASE}/champion_stats`,
      {
        params: { per_page: limit },
        headers: authHeader(),
        timeout: 12000,
      },
    );
    // pick_rate 내림차순
    return (data.data ?? [])
      .filter((c) => c.games_count >= 100)
      .sort((a, b) => b.picks_rate - a.picks_rate);
  } catch {
    return [];
  }
}

/* =====================================================================
 * 로스터 자동 추출 — 팀의 최근 LCK 매치 1개 → match_maps → player_match_map_stats
 * 각 포지션 1명씩 추출 (가장 최근 게임 우선)
 * ===================================================================*/

export interface DiscoveredPlayer {
  id: number;
  nickname: string;
  /** 영문 본명 (예: "Lee Sang-hyeok") — BDL /players search 응답에서 보강 */
  nameEn?: string;
  /** 국적 ISO 코드 또는 영문 국가명 */
  country?: string;
  role: string;
  recentChampions: string[];
}

interface BdlPlayer {
  id: number;
  nickname: string;
  first_name?: string;
  last_name?: string;
  country?: string;
  team?: { id?: number; name?: string };
}

/** BDL /players?search=nickname → first_name/last_name 추출 (team.id 매칭). */
async function fetchBdlPlayerName(
  nickname: string,
  teamBdlId: number,
): Promise<{ nameEn?: string; country?: string }> {
  try {
    const { data } = await axios.get<BdlListResp<BdlPlayer>>(
      `${BASE}/players`,
      {
        params: { search: nickname, per_page: 10 },
        headers: authHeader(),
        timeout: 10000,
      },
    );
    const rows = data.data ?? [];
    // 같은 닉네임의 여러 선수 — team.id 매치되는 것 선택
    const found =
      rows.find((r) => r.nickname === nickname && r.team?.id === teamBdlId) ??
      rows.find((r) => r.nickname.toLowerCase() === nickname.toLowerCase() && r.team?.id === teamBdlId) ??
      rows.find((r) => r.nickname === nickname);
    if (!found) return {};
    const parts = [found.first_name, found.last_name].filter(Boolean);
    const nameEn = parts.length > 0 ? parts.join(" ").trim() : undefined;
    return { nameEn, country: found.country };
  } catch {
    return {};
  }
}

/**
 * 챔피언 → 라인 추정 매핑 (BDL role 필드가 null 일 때 fallback).
 * LCK 자주 등장 챔피언 위주. 여러 라인 가능 챔피언은 가장 흔한 라인 1개.
 */
const CHAMPION_ROLE_HINT: Record<string, "top" | "jungle" | "mid" | "bot" | "support"> = {
  // TOP
  Aatrox: "top", Camille: "top", Darius: "top", Fiora: "top", Garen: "top",
  Gnar: "top", Gragas: "top", Gwen: "top", Illaoi: "top", Irelia: "top",
  Jax: "top", Jayce: "top", Kennen: "top", Kled: "top", "K'Sante": "top", KSante: "top",
  Malphite: "top", Mordekaiser: "top", Nasus: "top", Ornn: "top", Poppy: "top",
  Renekton: "top", Riven: "top", Sett: "top", Shen: "top", Singed: "top",
  Sion: "top", Tahm: "top", "Tahm Kench": "top", TahmKench: "top",
  Teemo: "top", Tryndamere: "top", Urgot: "top", Volibear: "top", Yorick: "top",
  Ambessa: "top", Naafiri: "top",
  // JUNGLE
  Diana: "jungle", Ekko: "jungle", Elise: "jungle", Evelynn: "jungle",
  Graves: "jungle", Hecarim: "jungle", Ivern: "jungle", "Jarvan IV": "jungle",
  JarvanIV: "jungle", Karthus: "jungle", Khazix: "jungle", "Kha'Zix": "jungle",
  KhaZix: "jungle", Kindred: "jungle", LeeSin: "jungle", "Lee Sin": "jungle",
  Lillia: "jungle", Maokai: "jungle", "Master Yi": "jungle", MasterYi: "jungle",
  Nidalee: "jungle", Nocturne: "jungle", Olaf: "jungle", Rammus: "jungle",
  RekSai: "jungle", "Rek'Sai": "jungle", Rengar: "jungle", Sejuani: "jungle",
  Shaco: "jungle", Skarner: "jungle", Trundle: "jungle", Udyr: "jungle",
  Vi: "jungle", Viego: "jungle", Warwick: "jungle", Wukong: "jungle",
  XinZhao: "jungle", "Xin Zhao": "jungle", Zac: "jungle",
  // MID
  Ahri: "mid", Akali: "mid", Akshan: "mid", Anivia: "mid", Annie: "mid",
  AurelionSol: "mid", "Aurelion Sol": "mid", Azir: "mid", Cassiopeia: "mid",
  Chogath: "mid", "Cho'Gath": "mid", ChoGath: "mid", Corki: "mid",
  Fizz: "mid", Galio: "mid", Hwei: "mid", Kassadin: "mid", Katarina: "mid",
  Leblanc: "mid", LeBlanc: "mid", Lissandra: "mid", Lux: "mid",
  Malzahar: "mid", Neeko: "mid", Orianna: "mid", Qiyana: "mid",
  Ryze: "mid", Sylas: "mid", Syndra: "mid", Taliyah: "mid",
  TwistedFate: "mid", "Twisted Fate": "mid", Veigar: "mid", Vex: "mid",
  Viktor: "mid", Vladimir: "mid", Xerath: "mid", Yasuo: "mid", Yone: "mid",
  Zed: "mid", Ziggs: "mid", Zoe: "mid",
  // BOT (ADC)
  Aphelios: "bot", Ashe: "bot", Caitlyn: "bot", Draven: "bot", Ezreal: "bot",
  Jhin: "bot", Jinx: "bot", "Kai'Sa": "bot", KaiSa: "bot", Kalista: "bot",
  Kogmaw: "bot", "Kog'Maw": "bot", KogMaw: "bot", Lucian: "bot",
  MissFortune: "bot", "Miss Fortune": "bot", Nilah: "bot", Samira: "bot",
  Sivir: "bot", Smolder: "bot", Tristana: "bot", Twitch: "bot", Varus: "bot",
  Vayne: "bot", Xayah: "bot", Zeri: "bot",
  // SUPPORT
  Alistar: "support", Bard: "support", Blitzcrank: "support", Braum: "support",
  Janna: "support", Karma: "support", Leona: "support", Lulu: "support",
  Milio: "support", Morgana: "support", Nami: "support", Nautilus: "support",
  Pyke: "support", Rakan: "support", Rell: "support", Renata: "support",
  "Renata Glasc": "support", Senna: "support", Seraphine: "support",
  Soraka: "support", Taric: "support", Thresh: "support", Yuumi: "support",
  Zilean: "support", Zyra: "support",
};

/**
 * recentSeriesIds: 최근 finished 매치 ID 여러 개 (시리즈 ID — BDL externalId).
 * BDL 매치별로 role 수집 일관되지 않아 — 매치마다 모든 game 의 player stats 를 훑음.
 * role 있는 게임 우선, 없으면 champion → role 매핑으로 fallback. 5명 모두 발견 시 중단.
 */
export async function discoverTeamRoster(
  teamBdlId: number,
  recentSeriesIds: Array<string | number>,
): Promise<DiscoveredPlayer[]> {
  // 라인별 1명만 유지 (가장 자주 등장하는 플레이어). 챔피언 풀은 누적.
  const byRole = new Map<
    string,
    { p: BdlPlayerMatchMapStat; champs: string[]; occurrences: number; role: string }
  >();

  outer: for (const sid of recentSeriesIds) {
    if (byRole.size >= 5) break;
    const maps = await fetchBdlMatchMaps(sid);
    if (maps.length === 0) continue;

    // BDL rate limit 회피 — 매치 사이 짧은 sleep
    await new Promise((r) => setTimeout(r, 300));

    for (const mp of maps) {
      if (byRole.size >= 5) break outer;
      try {
        const { data } = await axios.get<BdlListResp<BdlPlayerMatchMapStat>>(
          `${BASE}/player_match_map_stats`,
          {
            params: { match_map_id: mp.id, per_page: 20 },
            headers: authHeader(),
            timeout: 12000,
          },
        );
        await new Promise((r) => setTimeout(r, 250));
        const rows = data.data ?? [];
        const teamRows = rows.filter((r) => r.team?.id === teamBdlId);
        if (teamRows.length === 0) continue;

        for (const r of teamRows) {
          // role 결정: BDL 응답 우선, null 이면 champion 매핑 fallback
          let role = r.role?.toLowerCase();
          if (!role && r.champion?.name) {
            role = CHAMPION_ROLE_HINT[r.champion.name]?.toLowerCase();
          }
          if (!role) continue;

          const cur = byRole.get(role);
          if (!cur) {
            byRole.set(role, {
              p: r,
              champs: r.champion ? [r.champion.name] : [],
              occurrences: 1,
              role,
            });
          } else {
            // 같은 라인에 등장한 다른 player → 더 자주 출전한 쪽 유지
            if (cur.p.player.id === r.player.id) {
              cur.occurrences += 1;
              if (r.champion && !cur.champs.includes(r.champion.name)) {
                cur.champs.push(r.champion.name);
              }
            } else {
              // 다른 선수가 같은 라인 → 출전 빈도 더 많을 가능성 있는 경우 교체.
              // 우선 첫 발견 우선 (LCK 활성 로스터는 거의 고정).
            }
          }
        }
      } catch {
        // 다음 게임/매치
      }
    }
  }

  // BDL /players search 로 본명/국적 보강 (5명 × 0.2s sleep ≈ 1초)
  const out: DiscoveredPlayer[] = [];
  for (const v of byRole.values()) {
    await new Promise((r) => setTimeout(r, 200));
    const { nameEn, country } = await fetchBdlPlayerName(
      v.p.player.nickname,
      teamBdlId,
    );
    out.push({
      id: v.p.player.id,
      nickname: v.p.player.nickname,
      nameEn,
      country,
      role: v.role,
      recentChampions: v.champs.slice(0, 3),
    });
  }
  return out;
}

/* =====================================================================
 * 1게임 단위 시장 — 팀 통계로 모델링
 * ===================================================================*/

export interface OneGameKillsModel {
  /** 양 팀 1게임 평균 총 킬 합 */
  expectedTotal: number;
  /** 표준편차 (시즌 분포 std) */
  totalStd: number;
  /** 마진(home - away) 평균 */
  expectedMargin: number;
  marginStd: number;
  /** 샘플 게임 수 */
  sample: number;
}

/**
 * team_match_map_stats 응답에서 양 팀의 1게임 통계 분포 계산.
 * 1게임 총 킬 OU, 1게임 핸디캡 모델링용.
 */
export function modelOneGameKills(
  homeStats: BdlTeamMatchMapStat[],
  awayStats: BdlTeamMatchMapStat[],
): OneGameKillsModel | null {
  if (homeStats.length < 5 || awayStats.length < 5) return null;

  // 각 게임의 총 킬 = 우리팀 kills + 상대팀 kills. 상대팀 kills는 응답에 없으므로
  // homeStats 의 enemy 정보로 추정 — 못 받으면 우리팀 kills 의 2배 근사.
  // 가장 단순: homeStats 의 kills 평균 × 2 ≈ 게임당 총 킬 (양 팀 비대칭이지만 시즌 평균은 비슷).
  function mean(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }
  function std(arr: number[], m: number): number {
    return Math.sqrt(
      arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, arr.length - 1),
    );
  }

  const homeKills = homeStats.map((s) => s.kills);
  const awayKills = awayStats.map((s) => s.kills);
  const hMean = mean(homeKills);
  const aMean = mean(awayKills);
  const totalMean = hMean + aMean;
  // 분산 합 ≈ Var(H) + Var(A) (독립 가정)
  const hStd = std(homeKills, hMean);
  const aStd = std(awayKills, aMean);
  const totalStd = Math.sqrt(hStd ** 2 + aStd ** 2);

  // 마진(home - away) 평균/분산도 동일 가정
  const marginMean = hMean - aMean;
  const marginStd = Math.sqrt(hStd ** 2 + aStd ** 2);

  return {
    expectedTotal: totalMean,
    totalStd,
    expectedMargin: marginMean,
    marginStd,
    sample: Math.min(homeStats.length, awayStats.length),
  };
}

/** 표준정규 CDF (Abramowitz·Stegun 근사). */
function normalCdf(x: number, mean: number, std: number): number {
  const z = (x - mean) / std;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** 1게임 총 킬 OVER 확률 (line=expectedTotal 반올림 가까운 0.5단위). */
export function oneGameKillsOver(
  model: OneGameKillsModel,
): { line: number; pOver: number } {
  // line = expectedTotal 근사값을 0.5 끝으로 (예: 25.6 → 25.5)
  const line = Math.round(model.expectedTotal * 2) / 2;
  const pOver = 1 - normalCdf(line, model.expectedTotal, model.totalStd);
  return {
    line,
    pOver: Math.max(0.05, Math.min(0.95, pOver)),
  };
}

/** 1게임 핸디캡 (강팀 -line 이상). */
export function oneGameHandicap(
  model: OneGameKillsModel,
): { pick: "HOME" | "AWAY"; line: number; prob: number } {
  const line = 3.5; // LCK 1게임 핸디캡 기본 라인 — 킬 차이
  const expectedMargin = model.expectedMargin;
  const pHomeCovers =
    1 - normalCdf(line, expectedMargin, model.marginStd);
  const pAwayCovers = normalCdf(-line, expectedMargin, model.marginStd);
  if (pHomeCovers >= pAwayCovers)
    return {
      pick: "HOME",
      line,
      prob: Math.max(0.05, Math.min(0.95, pHomeCovers)),
    };
  return {
    pick: "AWAY",
    line,
    prob: Math.max(0.05, Math.min(0.95, pAwayCovers)),
  };
}

export const lolCollector: MatchCollector = {
  league: "LOL",
  // day-loop fallback — 보통 collect.ts 가 fetchLolLckAll 로 special-case 처리.
  // 누가 직접 호출해도 깨지지 않도록 같은 데이터에서 날짜 필터링.
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    const all = await fetchLolAll();
    const ymd = date.slice(0, 10);
    return all.filter((m) => m.startTime.toISOString().slice(0, 10) === ymd);
  },
};
