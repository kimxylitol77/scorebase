// API-Football `/fixtures/lineups` — 양 팀 startXI + formation + grid 좌표.
// 출전 명단은 경기 시작 ~1시간 전 발표 → 캐시 2분 (sub 발생 가능성 고려).

import axios from "axios";
import { resolveFixture, type FixtureInfo } from "@/lib/live/soccer-live-stats";

const BASE = "https://v3.football.api-sports.io";

export interface FormationPlayer {
  number: number | null;
  name: string;
  pos: "G" | "D" | "M" | "F" | null;
  /** "row:col" 문자열. row 1 = own goal, col 1 = right side. */
  grid: string | null;
}

export interface TeamLineup {
  teamName: string;
  formation: string | null;
  coach: string | null;
  startXI: FormationPlayer[];
  substitutes: FormationPlayer[];
}

export interface MatchLineups {
  home: TeamLineup;
  away: TeamLineup;
}

function client() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) return null;
  return axios.create({
    baseURL: BASE,
    timeout: 8_000,
    headers: { "x-apisports-key": key },
  });
}

interface RawPlayer {
  player: {
    id: number;
    name: string;
    number?: number;
    pos?: string;
    grid?: string;
  };
}
interface RawTeamLineup {
  team: { id: number; name: string };
  formation?: string;
  coach?: { name?: string };
  startXI?: RawPlayer[];
  substitutes?: RawPlayer[];
}

interface CacheEntry {
  payload: MatchLineups | null;
  at: number;
}
const lineupsCache = new Map<number, CacheEntry>();
const LINEUPS_TTL_MS = 2 * 60_000;

function toFormPlayer(p: RawPlayer): FormationPlayer {
  return {
    number: p.player.number ?? null,
    name: p.player.name,
    pos: (p.player.pos as "G" | "D" | "M" | "F") ?? null,
    grid: p.player.grid ?? null,
  };
}

function buildTeamLineup(raw: RawTeamLineup): TeamLineup {
  return {
    teamName: raw.team.name,
    formation: raw.formation ?? null,
    coach: raw.coach?.name ?? null,
    startXI: (raw.startXI ?? []).map(toFormPlayer),
    substitutes: (raw.substitutes ?? []).map(toFormPlayer),
  };
}

async function fetchLineupsForFixture(info: FixtureInfo): Promise<MatchLineups | null> {
  const cached = lineupsCache.get(info.id);
  if (cached && Date.now() - cached.at < LINEUPS_TTL_MS) return cached.payload;
  const c = client();
  if (!c) return null;
  try {
    const { data } = await c.get("/fixtures/lineups", { params: { fixture: info.id } });
    const teams = (data?.response ?? []) as RawTeamLineup[];
    if (teams.length < 2) {
      lineupsCache.set(info.id, { payload: null, at: Date.now() });
      return null;
    }
    const homeRaw = teams.find((t) => t.team.id === info.homeTeamId) ?? teams[0];
    const awayRaw = teams.find((t) => t.team.id === info.awayTeamId) ?? teams[1];
    const payload: MatchLineups = {
      home: buildTeamLineup(homeRaw),
      away: buildTeamLineup(awayRaw),
    };
    lineupsCache.set(info.id, { payload, at: Date.now() });
    return payload;
  } catch {
    lineupsCache.set(info.id, { payload: null, at: Date.now() });
    return null;
  }
}

export async function fetchSoccerLineups(
  league: string,
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<MatchLineups | null> {
  if (!awayName || !homeName) return null;
  const info = await resolveFixture(league, dateKst, awayName, homeName);
  if (!info) return null;
  return fetchLineupsForFixture(info);
}
