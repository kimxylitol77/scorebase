// API-Sports Basketball v1 — WNBA league=13
//
// 결제: API-Sports Basketball Ultra ($39/mo, 75K req/일). NBA 와 별도 host.
// 호스트: v1.basketball.api-sports.io (NBA v2 와 다름)
// 시즌: 2026 (4월 ~ 9월). 343 매치, 13팀.
//
// status 코드 (v1 basketball — NBA v2 와 다르게 문자열):
//   NS                    → SCHEDULED
//   Q1/Q2/Q3/Q4/HT/BT/OT  → LIVE
//   FT / AOT              → FINISHED
//   POST / CANC / SUSP    → POSTPONED
//
// externalId: API-Sports game.id (integer).

import axios from "axios";
import type { MatchCollector, MatchStatus, NormalizedMatch } from "./types";

const BASE = "https://v1.basketball.api-sports.io";
const WNBA_LEAGUE_ID = 13;

/**
 * WNBA 시즌은 달력 연도 (예: 2026 = 2026-04 ~ 2026-09).
 * 날짜에서 자동 추출.
 */
function seasonFor(date: string): string {
  const iso = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
  return iso.slice(0, 4);
}

interface ApiBasketballGame {
  id: number;
  date: string;
  status: { long: string; short: string; timer: string | null };
  league: { id: number; name: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  scores: {
    home: { total: number | null };
    away: { total: number | null };
  };
  venue?: string | null;
}

interface ApiBasketballResponse {
  response?: ApiBasketballGame[];
  errors?: unknown;
}

function mapStatus(short: string): MatchStatus {
  if (short === "NS") return "SCHEDULED";
  if (["Q1", "Q2", "Q3", "Q4", "HT", "BT", "OT"].includes(short)) return "LIVE";
  if (["FT", "AOT"].includes(short)) return "FINISHED";
  if (["POST", "CANC", "SUSP", "AWD", "ABD"].includes(short)) return "POSTPONED";
  return "SCHEDULED";
}

export async function fetchApiWnbaByDate(date: string): Promise<NormalizedMatch[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return [];
  const d = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : date;
  const season = seasonFor(d);

  const { data } = await axios.get<ApiBasketballResponse>(`${BASE}/games`, {
    params: { league: WNBA_LEAGUE_ID, season, date: d },
    headers: { "x-apisports-key": key },
    timeout: 15_000,
  });
  const games = data?.response ?? [];

  return games.map((g): NormalizedMatch => {
    const home = g.teams.home;
    const away = g.teams.away;
    const homeScore = g.scores.home.total;
    const awayScore = g.scores.away.total;
    return {
      league: "WNBA",
      externalId: String(g.id),
      homeTeam: {
        externalId: String(home.id),
        name: home.name,
        logoUrl: home.logo ?? undefined,
      },
      awayTeam: {
        externalId: String(away.id),
        name: away.name,
        logoUrl: away.logo ?? undefined,
      },
      homeScore: typeof homeScore === "number" ? homeScore : undefined,
      awayScore: typeof awayScore === "number" ? awayScore : undefined,
      status: mapStatus(g.status.short),
      startTime: new Date(g.date),
      raw: g,
    };
  });
}

export const wnbaCollectorApiSports: MatchCollector = {
  league: "WNBA",
  async fetchByDate(date: string): Promise<NormalizedMatch[]> {
    return fetchApiWnbaByDate(date);
  },
};
