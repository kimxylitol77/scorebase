// API-Football `/fixtures/events` — 골 / 카드 / 교체 / VAR 이벤트.
// 라이브 중엔 30초 캐시 (1분 폴링이지만 새 이벤트 빠르게 반영).

import axios from "axios";
import { resolveFixture, type FixtureInfo } from "@/lib/live/soccer-live-stats";

const BASE = "https://v3.football.api-sports.io";

export type SoccerEventType = "goal" | "card" | "subst" | "var";
export type SoccerEventDetail =
  | "Normal Goal"
  | "Penalty"
  | "Own Goal"
  | "Missed Penalty"
  | "Yellow Card"
  | "Red Card"
  | "Second Yellow card"
  | "Substitution"
  | "VAR";

export interface SoccerEvent {
  minute: number;
  extra: number;
  type: SoccerEventType;
  detail: string;
  side: "home" | "away";
  playerName: string | null;
  assistName: string | null;
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

interface RawEvent {
  time: { elapsed: number | null; extra?: number | null };
  team: { id: number; name: string };
  player: { id?: number; name?: string };
  assist?: { id?: number; name?: string };
  type: string; // "Goal" | "Card" | "subst" | "Var"
  detail: string;
  comments?: string | null;
}

function normalizeType(t: string): SoccerEventType {
  const lo = t.toLowerCase();
  if (lo.startsWith("goal")) return "goal";
  if (lo.startsWith("card")) return "card";
  if (lo.startsWith("subst")) return "subst";
  return "var";
}

interface CacheEntry {
  payload: SoccerEvent[] | null;
  at: number;
}
const cache = new Map<number, CacheEntry>();
const TTL_MS = 30_000;

async function fetchEventsForFixture(info: FixtureInfo): Promise<SoccerEvent[] | null> {
  const cached = cache.get(info.id);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.payload;
  const c = client();
  if (!c) return null;
  try {
    const { data } = await c.get("/fixtures/events", { params: { fixture: info.id } });
    const raws = (data?.response ?? []) as RawEvent[];
    const out: SoccerEvent[] = [];
    for (const r of raws) {
      const min = r.time?.elapsed;
      if (typeof min !== "number") continue;
      const side: "home" | "away" =
        r.team.id === info.homeTeamId ? "home" : "away";
      out.push({
        minute: min,
        extra: r.time?.extra ?? 0,
        type: normalizeType(r.type),
        detail: r.detail,
        side,
        playerName: r.player?.name ?? null,
        assistName: r.assist?.name ?? null,
      });
    }
    // 최신 시간 위로 정렬
    out.sort((a, b) => {
      const ka = a.minute * 100 + a.extra;
      const kb = b.minute * 100 + b.extra;
      return kb - ka;
    });
    cache.set(info.id, { payload: out, at: Date.now() });
    return out;
  } catch {
    cache.set(info.id, { payload: null, at: Date.now() });
    return null;
  }
}

export async function fetchSoccerEvents(
  league: string,
  dateKst: string,
  awayName: string,
  homeName: string,
): Promise<SoccerEvent[] | null> {
  if (!awayName || !homeName) return null;
  const info = await resolveFixture(league, dateKst, awayName, homeName);
  if (!info) return null;
  return fetchEventsForFixture(info);
}
