// 단일 매치 라이브 odds — The Odds API `/events/{eventId}/odds` 사용.
// `/sports/{key}/odds` 전체 호출보다 credit 효율 큼 (이벤트 1개만).
//
// 흐름:
//   1) resolveOddsEventId(league, home, away) → /events 한번 호출 후 팀명 매치로 id 찾기
//   2) fetchEventOdds(league, eventId) → /events/{id}/odds 호출
// 캐시: event_id 4시간 (게임 시간 내내 유효), odds 60초 (1분 폴링)

import { SPORT_KEY, normalizeOddsTeamName } from "@/lib/odds/odds-api";

const BASE = "https://api.the-odds-api.com/v4";

export interface LiveOddsSnapshot {
  homeTeam: string;
  awayTeam: string;
  /** 1X2 평균 (vig 미제거 decimal) */
  h2h: { home: number; draw: number | null; away: number } | null;
  /** 총득점 OVER/UNDER 평균 */
  totals: { line: number; over: number; under: number } | null;
  /** 핸디캡 평균 */
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number; // 평균에 들어간 북메이커 수
  /** 북메이커별 raw odds — UI 의 접기 펼치기에서 표시. h2h 만 있고 totals/spread 없는 BM 도 포함 */
  bookmakerList: Array<{
    key: string;
    title: string;
    h2h: { home: number; draw: number | null; away: number } | null;
  }>;
  fetchedAt: number; // epoch ms
  source: "the-odds-api";
}

interface RawOutcome {
  name: string;
  price: number;
  point?: number;
}
interface RawMarket {
  key: string;
  outcomes: RawOutcome[];
}
interface RawBookmaker {
  key: string;
  title: string;
  markets: RawMarket[];
}
interface RawEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers?: RawBookmaker[];
}

// ───── event_id 캐시 ─────
interface EventCacheEntry {
  id: string | null;
  at: number;
}
const eventCache = new Map<string, EventCacheEntry>();
const EVENT_TTL_MS = 4 * 60 * 60_000;

function eventCacheKey(league: string, away: string, home: string): string {
  return `${league}|${away.toLowerCase()}|${home.toLowerCase()}`;
}

// 라이브 odds 호출자는 (영문) team name 을 직접 넘김 — api-sports baseball/api-football 응답 그대로.
// Odds API 도 영문이라 둘 다 normalize 후 단순 substring 매칭.
function teamMatch(oddsName: string, ourName: string): boolean {
  const a = normalizeOddsTeamName(oddsName);
  const b = normalizeOddsTeamName(ourName);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

export async function resolveOddsEventId(
  league: string,
  awayName: string,
  homeName: string,
): Promise<string | null> {
  const sportKey = SPORT_KEY[league];
  if (!sportKey) return null;
  const key = eventCacheKey(league, awayName, homeName);
  const cached = eventCache.get(key);
  if (cached && Date.now() - cached.at < EVENT_TTL_MS) return cached.id;

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(
      `${BASE}/sports/${sportKey}/events?apiKey=${encodeURIComponent(apiKey)}`,
      { signal: ctrl.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    if (!res.ok) {
      eventCache.set(key, { id: null, at: Date.now() });
      return null;
    }
    const data = (await res.json()) as RawEvent[];
    if (!Array.isArray(data)) {
      eventCache.set(key, { id: null, at: Date.now() });
      return null;
    }
    const match = data.find(
      (e) =>
        teamMatch(e.home_team, homeName) &&
        teamMatch(e.away_team, awayName),
    );
    const id = match?.id ?? null;
    eventCache.set(key, { id, at: Date.now() });
    return id;
  } catch {
    eventCache.set(key, { id: null, at: Date.now() });
    return null;
  }
}

// ───── odds 캐시 ─────
interface OddsCacheEntry {
  snapshot: LiveOddsSnapshot | null;
  at: number;
}
const oddsCache = new Map<string, OddsCacheEntry>();
// 3분 폴링 — 라이브 폴링이 일 ~1,000크레딧을 소모해 월 쿼터(20,000)를 6/23~25 소진시킨
// 주범(전 경기 3일 블랙아웃). TTL 1분→3분 + regions 축소로 소모 ~1/6 로 절감 (2026-07 분석).
const ODDS_TTL_MS = 180_000;

function avgH2h(event: RawEvent): LiveOddsSnapshot["h2h"] {
  let hSum = 0,
    dSum = 0,
    aSum = 0,
    n = 0,
    dN = 0;
  for (const b of event.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "h2h");
    if (!m) continue;
    let h: number | null = null,
      d: number | null = null,
      a: number | null = null;
    for (const o of m.outcomes) {
      if (o.name === event.home_team) h = o.price;
      else if (o.name === event.away_team) a = o.price;
      else if (o.name === "Draw") d = o.price;
    }
    if (h && a) {
      hSum += h;
      aSum += a;
      n++;
      if (d) {
        dSum += d;
        dN++;
      }
    }
  }
  if (n === 0) return null;
  return {
    home: hSum / n,
    draw: dN > 0 ? dSum / dN : null,
    away: aSum / n,
  };
}

function avgTotals(event: RawEvent): LiveOddsSnapshot["totals"] {
  // 가장 흔한 line 선택
  const lineVotes = new Map<number, number>();
  for (const b of event.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "totals");
    if (!m) continue;
    const over = m.outcomes.find((o) => o.name === "Over");
    if (over?.point != null) {
      lineVotes.set(over.point, (lineVotes.get(over.point) ?? 0) + 1);
    }
  }
  if (lineVotes.size === 0) return null;
  const sorted = [...lineVotes.entries()].sort((a, b) => b[1] - a[1]);
  const bestLine = sorted[0][0];
  let oSum = 0,
    uSum = 0,
    n = 0;
  for (const b of event.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "totals");
    if (!m) continue;
    const over = m.outcomes.find((o) => o.name === "Over" && o.point === bestLine);
    const under = m.outcomes.find((o) => o.name === "Under" && o.point === bestLine);
    if (over && under) {
      oSum += over.price;
      uSum += under.price;
      n++;
    }
  }
  if (n === 0) return null;
  return { line: bestLine, over: oSum / n, under: uSum / n };
}

function avgSpread(event: RawEvent): LiveOddsSnapshot["spread"] {
  const lineVotes = new Map<string, number>();
  for (const b of event.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "spreads");
    if (!m) continue;
    const homeOut = m.outcomes.find((o) => o.name === event.home_team);
    if (homeOut?.point == null) continue;
    const pick = homeOut.point < 0 ? "HOME" : "AWAY";
    const absLine = Math.abs(homeOut.point);
    const key = `${pick}|${absLine}`;
    lineVotes.set(key, (lineVotes.get(key) ?? 0) + 1);
  }
  if (lineVotes.size === 0) return null;
  const [bestKey] = [...lineVotes.entries()].sort((a, b) => b[1] - a[1])[0];
  const [pickStr, absStr] = bestKey.split("|");
  const pick = pickStr as "HOME" | "AWAY";
  const absLine = Number(absStr);
  const targetHomePoint = pick === "HOME" ? -absLine : absLine;

  let hSum = 0,
    aSum = 0,
    n = 0;
  for (const b of event.bookmakers ?? []) {
    const m = b.markets.find((x) => x.key === "spreads");
    if (!m) continue;
    const ho = m.outcomes.find(
      (o) => o.name === event.home_team && o.point === targetHomePoint,
    );
    const ao = m.outcomes.find(
      (o) => o.name === event.away_team && o.point === -targetHomePoint,
    );
    if (ho && ao) {
      hSum += ho.price;
      aSum += ao.price;
      n++;
    }
  }
  if (n === 0) return null;
  return { line: absLine, pick, homeOdds: hSum / n, awayOdds: aSum / n };
}

async function fetchEventOdds(
  league: string,
  eventId: string,
): Promise<LiveOddsSnapshot | null> {
  const sportKey = SPORT_KEY[league];
  if (!sportKey) return null;
  const cacheKey = `${league}|${eventId}`;
  const cached = oddsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ODDS_TTL_MS) return cached.snapshot;

  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const params = new URLSearchParams({
      apiKey,
      regions: "us", // eu 제외 — 호출당 6→3크레딧 (쿼터 소진 방지, 표시값은 북메이커 평균이라 영향 미미)
      markets: "h2h,totals,spreads",
      oddsFormat: "decimal",
    });
    const res = await fetch(
      `${BASE}/sports/${sportKey}/events/${eventId}/odds?${params.toString()}`,
      { signal: ctrl.signal, cache: "no-store" },
    );
    clearTimeout(timer);
    if (!res.ok) {
      oddsCache.set(cacheKey, { snapshot: null, at: Date.now() });
      return null;
    }
    const data = (await res.json()) as RawEvent;
    if (!data || typeof data !== "object" || !data.id) {
      oddsCache.set(cacheKey, { snapshot: null, at: Date.now() });
      return null;
    }
    const h2h = avgH2h(data);
    const totals = avgTotals(data);
    const spread = avgSpread(data);
    const bookmakers = data.bookmakers?.length ?? 0;
    if (!h2h && !totals && !spread) {
      oddsCache.set(cacheKey, { snapshot: null, at: Date.now() });
      return null;
    }
    // 북메이커별 h2h 추출 — 표 표시용. odds 큰 순으로 정렬은 UI 단에서.
    const bookmakerList: LiveOddsSnapshot["bookmakerList"] = [];
    for (const b of data.bookmakers ?? []) {
      const m = b.markets.find((x) => x.key === "h2h");
      if (!m) continue;
      const home = m.outcomes.find((o) => o.name === data.home_team)?.price;
      const away = m.outcomes.find((o) => o.name === data.away_team)?.price;
      const drawO = m.outcomes.find((o) => o.name === "Draw")?.price;
      if (typeof home !== "number" || typeof away !== "number") continue;
      bookmakerList.push({
        key: b.key,
        title: b.title,
        h2h: { home, away, draw: typeof drawO === "number" ? drawO : null },
      });
    }
    const snapshot: LiveOddsSnapshot = {
      homeTeam: data.home_team,
      awayTeam: data.away_team,
      h2h,
      totals,
      spread,
      bookmakers,
      bookmakerList,
      fetchedAt: Date.now(),
      source: "the-odds-api",
    };
    oddsCache.set(cacheKey, { snapshot, at: Date.now() });
    return snapshot;
  } catch {
    oddsCache.set(cacheKey, { snapshot: null, at: Date.now() });
    return null;
  }
}

/**
 * 라이브 odds — 매치 단일 호출 (1분 캐시).
 * 호출자: /api/live/match/[gameId] route.
 */
export async function fetchLiveOdds(
  league: string,
  awayName: string,
  homeName: string,
): Promise<LiveOddsSnapshot | null> {
  if (!awayName || !homeName) return null;
  const eventId = await resolveOddsEventId(league, awayName, homeName);
  if (!eventId) return null;
  return fetchEventOdds(league, eventId);
}

/** 라이브 odds 지원 리그 (SPORT_KEY 에 매핑된 리그) */
export function isLiveOddsSupported(league: string): boolean {
  return league in SPORT_KEY;
}
