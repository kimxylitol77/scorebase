// API-Sports NBA v2 collector — /games?date=YYYY-MM-DD
//
// ESPN scoreboard 대체 — TBD placeholder 안 등록 + 정식 30팀만 + 풍부한 매치 metadata.
// 결제: NBA Ultra ($39/mo, 75K req/일).
//
// status 코드:
//   1 = NS (Not Started)        → SCHEDULED
//   2 = LIVE / Q1~OT 진행 중    → LIVE
//   3 = FT / Finished           → FINISHED
//   4 = PST (Postponed)         → POSTPONED
//   5 = CANC (Cancelled)        → POSTPONED (우리 schema 에 CANC 없음)
//
// externalId: API-Sports game.id (integer, e.g. 16856) — ESPN id (e.g. 401873341) 와 다름.
// 전환 시 기존 ESPN-id NBA 매치들과 duplicate 됨 → 마이그레이션 cleanup 필요.

import axios from "axios";
import { nbaEspnLogo } from "./nba-logos";
import type { MatchCollector, MatchStatus, NormalizedMatch } from "./types";

const BASE = "https://v2.nba.api-sports.io";

interface ApiNbaGame {
  id: number;
  date: { start: string; end: string | null };
  status: { clock: string | null; halftime: boolean; short: number; long: string };
  teams: {
    home: { id: number; name: string; nickname?: string; code?: string; logo?: string };
    visitors: { id: number; name: string; nickname?: string; code?: string; logo?: string };
  };
  scores: {
    home: { points: number | null };
    visitors: { points: number | null };
  };
}

interface ApiNbaResponse {
  response?: ApiNbaGame[];
  errors?: unknown;
}

function mapStatus(short: number): MatchStatus {
  if (short === 1) return "SCHEDULED";
  if (short === 2) return "LIVE";
  if (short === 3) return "FINISHED";
  if (short === 4 || short === 5) return "POSTPONED";
  return "SCHEDULED";
}

export async function fetchApiNbaByDate(date: string): Promise<NormalizedMatch[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  // ESPN 은 YYYYMMDD, API-Sports 는 YYYY-MM-DD
  const d = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
  const { data } = await axios.get<ApiNbaResponse>(`${BASE}/games`, {
    params: { date: d },
    headers: { "x-apisports-key": key },
    timeout: 15_000,
  });
  const games = data?.response ?? [];

  return games.map((g): NormalizedMatch => {
    const home = g.teams.home;
    const visitors = g.teams.visitors;
    const homeScore = g.scores.home.points ?? undefined;
    const awayScore = g.scores.visitors.points ?? undefined;
    return {
      league: "NBA",
      externalId: String(g.id),
      homeTeam: {
        externalId: String(home.id),
        name: home.name,
        shortName: home.code ?? home.nickname ?? undefined,
        // 로고는 이름 기준 ESPN 으로 고정 — api-sports wikimedia(/fr/·/thumb/ 불안정) 대신.
        logoUrl: nbaEspnLogo(home.name) ?? home.logo ?? undefined,
      },
      awayTeam: {
        externalId: String(visitors.id),
        name: visitors.name,
        shortName: visitors.code ?? visitors.nickname ?? undefined,
        logoUrl: nbaEspnLogo(visitors.name) ?? visitors.logo ?? undefined,
      },
      homeScore: typeof homeScore === "number" ? homeScore : undefined,
      awayScore: typeof awayScore === "number" ? awayScore : undefined,
      status: mapStatus(g.status.short),
      startTime: new Date(g.date.start),
      raw: g,
    };
  });
}

export const nbaCollectorApiSports: MatchCollector = {
  league: "NBA",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchApiNbaByDate(date);
  },
};
