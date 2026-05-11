// LCK (League of Legends Champions Korea) collector.
// 데이터 소스: BALLDONTLIE LoL API (https://api.balldontlie.io/lol/v1)
// GOAT plan 으로 e스포츠 endpoint unlock.
//
// LCK 매치는 BO(Best-of) 시리즈 — homeScore/awayScore 에 세트 점수(0/1/2/3) 저장.
// home/away 개념이 없어 BALLDONTLIE 의 team1=home, team2=away 로 매핑.

import axios from "axios";
import type {
  MatchCollector,
  MatchStatus,
  NormalizedMatch,
} from "./types";

const BASE = "https://api.balldontlie.io/lol/v1";

// LCK 2026 Season tournament id. 시즌 종료 시 새 tournament id 로 교체 필요.
// (한 시즌이 끝나면 매치 fetch 가 비게 되니까 시즌 전환 시 신경 써야 함)
const LCK_TOURNAMENT_IDS = [324];

// LCK 10팀 한글명 매핑 (BALLDONTLIE team id 기준).
// 새 시즌에 팀 ID가 바뀌면 추가/수정.
const LCK_TEAM_NAMES_KO: Record<string, { name: string; short: string }> = {
  "1": { name: "T1", short: "T1" },
  "2": { name: "Gen.G", short: "GEN" },
  "7": { name: "한화생명e스포츠", short: "HLE" },
  "8": { name: "KT 롤스터", short: "KT" },
  "21": { name: "디플러스 기아", short: "DK" },
  "35": { name: "BNK 피어엑스", short: "BFX" },
  "62": { name: "농심 레드포스", short: "NS" },
  "66": { name: "한진 브리온", short: "BRO" },
  "320": { name: "DN SOOPers", short: "DNS" },
  "321": { name: "DRX", short: "DRX" },
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

/** LCK tournament 전체 매치 (cursor 페이지네이션). */
export async function fetchLolLckAll(): Promise<NormalizedMatch[]> {
  const out: BdlMatch[] = [];
  let cursor: number | undefined;
  for (let i = 0; i < 10; i++) {
    const params: Record<string, unknown> = {
      "tournament_ids[]": LCK_TOURNAMENT_IDS,
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
    .filter((m) => m.team1 && m.team2)
    .map((m): NormalizedMatch => {
      const t1 = m.team1!;
      const t2 = m.team2!;
      const t1Ko = LCK_TEAM_NAMES_KO[String(t1.id)];
      const t2Ko = LCK_TEAM_NAMES_KO[String(t2.id)];
      return {
        league: "LOL",
        externalId: String(m.id),
        homeTeam: {
          externalId: String(t1.id),
          name: t1Ko?.name ?? t1.name,
          shortName: t1Ko?.short,
        },
        awayTeam: {
          externalId: String(t2.id),
          name: t2Ko?.name ?? t2.name,
          shortName: t2Ko?.short,
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
}

interface StandingsInputMatch {
  league: string;
  status: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number | null;
  awayScore: number | null;
}

/** LCK FINISHED 매치들에서 정규 순위 집계 (시리즈 1승=1, 동률 시 세트 격차). */
export function calcLckStandings(
  matches: StandingsInputMatch[],
): Map<number, LckStanding> {
  const acc = new Map<number, Omit<LckStanding, "rank">>();
  function init(id: number) {
    if (!acc.has(id))
      acc.set(id, { teamId: id, wins: 0, losses: 0, setsWon: 0, setsLost: 0 });
  }
  for (const m of matches) {
    if (m.league !== "LOL") continue;
    if (m.status !== "FINISHED") continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    init(m.homeTeamId);
    init(m.awayTeamId);
    const h = acc.get(m.homeTeamId)!;
    const a = acc.get(m.awayTeamId)!;
    h.setsWon += m.homeScore;
    h.setsLost += m.awayScore;
    a.setsWon += m.awayScore;
    a.setsLost += m.homeScore;
    if (m.homeScore > m.awayScore) {
      h.wins += 1;
      a.losses += 1;
    } else if (m.awayScore > m.homeScore) {
      a.wins += 1;
      h.losses += 1;
    }
    // BO 시리즈는 동점 없음 — 동점 매치 자동 무시
  }
  // 정렬 — 승률(승/총경기) 내림차순, 동률 시 세트 격차
  const sorted = [...acc.values()].sort((x, y) => {
    const wpx = x.wins + x.losses > 0 ? x.wins / (x.wins + x.losses) : 0;
    const wpy = y.wins + y.losses > 0 ? y.wins / (y.wins + y.losses) : 0;
    if (wpy !== wpx) return wpy - wpx;
    const sdx = x.setsWon - x.setsLost;
    const sdy = y.setsWon - y.setsLost;
    return sdy - sdx;
  });
  const out = new Map<number, LckStanding>();
  for (let i = 0; i < sorted.length; i++) {
    out.set(sorted[i].teamId, { ...sorted[i], rank: i + 1 });
  }
  return out;
}

export const lolCollector: MatchCollector = {
  league: "LOL",
  // day-loop fallback — 보통 collect.ts 가 fetchLolLckAll 로 special-case 처리.
  // 누가 직접 호출해도 깨지지 않도록 같은 데이터에서 날짜 필터링.
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    const all = await fetchLolLckAll();
    const ymd = date.slice(0, 10);
    return all.filter((m) => m.startTime.toISOString().slice(0, 10) === ymd);
  },
};
