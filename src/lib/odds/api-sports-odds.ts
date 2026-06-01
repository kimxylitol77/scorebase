// API-Sports(api-football) 경기별 배당 — odds?fixture={id}.
// 우리 Match.externalId 가 api-football fixture id 체계인 리그(J2/남미/MLS 등)는
// 매핑 없이 그대로 조회 가능. The Odds API 가 못 주는 한국/하위 리그 배당 보완용.
import "server-only";

const BASE = "https://v3.football.api-sports.io";

export interface OddsValue {
  value: string;
  odd: string;
}
export interface OddsMarket {
  name: string;
  values: OddsValue[];
}
export interface FixtureOdds {
  bookmakerCount: number;
  bookmakers: { name: string; markets: OddsMarket[] }[];
}

/** 한 경기(fixtureId = Match.externalId)의 북메이커별 배당. 없으면 null. */
export async function fetchFixtureOdds(fixtureId: string): Promise<FixtureOdds | null> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || !/^\d+$/.test(fixtureId)) return null;
  try {
    const res = await fetch(`${BASE}/odds?fixture=${fixtureId}`, {
      headers: { "x-apisports-key": key },
      next: { revalidate: 600 }, // 10분 캐시 (배당 변동 흡수 + req 절약)
    });
    if (!res.ok) return null;
    const j = await res.json();
    const ev = j.response?.[0];
    if (!ev?.bookmakers?.length) return null;
    return {
      bookmakerCount: ev.bookmakers.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bookmakers: ev.bookmakers.map((b: any) => ({
        name: b.name,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        markets: (b.bets || []).map((bet: any) => ({ name: bet.name, values: bet.values || [] })),
      })),
    };
  } catch {
    return null;
  }
}
