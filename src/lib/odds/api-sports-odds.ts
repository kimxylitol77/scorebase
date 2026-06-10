// API-Sports(api-football) 경기별 배당 — odds?fixture={id}.
// 우리 Match.externalId 가 api-football fixture id 체계인 리그(J2/남미/MLS 등)는
// 매핑 없이 그대로 조회 가능. The Odds API 가 못 주는 한국/하위 리그 배당 보완용.
import "server-only";
import { prisma } from "@/lib/db";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";

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

/** FixtureOdds → 1X2 + 오버언더(2.5) 평균. 데이터 없으면 null. */
function parseFixtureOdds(fo: FixtureOdds): {
  home: number; draw: number; away: number;
  over: number | null; under: number | null; line: number | null; books: number;
} | null {
  const h: number[] = [], d: number[] = [], a: number[] = [], ov: number[] = [], un: number[] = [];
  for (const b of fo.bookmakers) {
    for (const m of b.markets) {
      if (m.name === "Match Winner") {
        for (const v of m.values) {
          const o = parseFloat(v.odd);
          if (v.value === "Home") h.push(o);
          else if (v.value === "Draw") d.push(o);
          else if (v.value === "Away") a.push(o);
        }
      } else if (m.name === "Goals Over/Under") {
        for (const v of m.values) {
          if (v.value === "Over 2.5") ov.push(parseFloat(v.odd));
          else if (v.value === "Under 2.5") un.push(parseFloat(v.odd));
        }
      }
    }
  }
  if (!h.length) return null;
  const avg = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
  return {
    home: avg(h)!, draw: avg(d) ?? 0, away: avg(a) ?? 0,
    over: avg(ov), under: avg(un), line: ov.length ? 2.5 : null, books: fo.bookmakerCount,
  };
}

/**
 * api-football odds 로 축구 배당 보강 — The Odds API 미커버 리그(친선/J2/남미/마이너).
 * 오늘±3일 축구 매치 중 oddsHome 없는 것 → fetchFixtureOdds → 1X2+오버언더 저장.
 * fetch-odds cron(매일 06:00 KST) 끝에서 호출. externalId 가 숫자(api-football fixture)인 매치만.
 */
export async function backfillApiFootballOdds(): Promise<number> {
  const ms = await prisma.match.findMany({
    where: {
      startTime: { gte: new Date(Date.now() - 86400000), lte: new Date(Date.now() + 3 * 86400000) },
      oddsHome: null,
    },
    select: { id: true, league: true, externalId: true },
  });
  const soccer = ms.filter(
    (m) => SOCCER_LEAGUES.has(m.league as never) && /^\d+$/.test(String(m.externalId)),
  );
  let ok = 0;
  for (const m of soccer) {
    const fo = await fetchFixtureOdds(String(m.externalId));
    if (fo) {
      const o = parseFixtureOdds(fo);
      if (o) {
        // vig 제거 implied → marketHome/Draw/Away 도 저장. 종전엔 raw(oddsHome)만 저장해
        // market-blend·Brier 시장 비교(marketHome 참조)가 af 배당을 전혀 못 쓰던 구멍.
        // The Odds API 미커버 리그(남미·이집트 등)는 이게 유일한 시장 신호.
        const pH = o.home > 1 ? 1 / o.home : 0;
        const pD = o.draw > 1 ? 1 / o.draw : 0;
        const pA = o.away > 1 ? 1 / o.away : 0;
        const pSum = pH + pA > 0 ? pH + pD + pA : 0;
        const implied =
          pH > 0 && pA > 0 && pSum > 0
            ? { marketHome: pH / pSum, marketDraw: pD / pSum, marketAway: pA / pSum }
            : {};
        await prisma.match.update({
          where: { id: m.id },
          data: {
            oddsHome: o.home, oddsDraw: o.draw, oddsAway: o.away,
            oddsTotalLine: o.line, oddsOver: o.over, oddsUnder: o.under,
            marketBookmakers: o.books, marketUpdatedAt: new Date(),
            ...implied,
          },
        });
        ok++;
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return ok;
}
