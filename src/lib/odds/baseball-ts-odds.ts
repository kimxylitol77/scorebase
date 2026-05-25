// TheSports baseball odds history (TsBaseballOddsHistory) → LiveOddsCard props 변환.
// 페이지 SSR 이 prisma 로 최근 row 조회 후 이 helper 로 odds + oddsHistory 만들어 카드에 전달.
//
// kind 설명 (TheSports 응답 분류):
//   - eu: 머니라인 (home/away decimal). 야구는 무승부 없음 → draw=null
//   - bs: 총득점 (over/under). v1=over, mid=line, v2=under
//   - asia: 런라인/핸디캡. v1=home odds, mid=line, v2=away odds

import { prisma } from "@/lib/db";

export interface BaseballLiveOdds {
  h2h: { home: number; draw: number | null; away: number } | null;
  totals: { line: number; over: number; under: number } | null;
  spread: {
    line: number;
    pick: "HOME" | "AWAY";
    homeOdds: number;
    awayOdds: number;
  } | null;
  bookmakers: number;
  bookmakerList?: never[];
  fetchedAt: number;
}

export interface BaseballOddsHistoryPoint {
  fetchedAt: number;
  home: number;
  draw: null;
  away: number;
}

const COMPANY_ID = "2"; // Bet365 — TheSports 응답에서 거의 유일하게 등장

interface PreparedRow {
  ts: number;
  v1: number;
  mid: number | null;
  v2: number;
}

async function fetchKind(matchId: number, kind: "eu" | "asia" | "bs", limit: number): Promise<PreparedRow[]> {
  // 최근 limit row (desc) → reverse 로 old→new
  const rows = await prisma.tsBaseballOddsHistory.findMany({
    where: { matchId, kind, companyId: COMPANY_ID },
    orderBy: { ts: "desc" },
    take: limit,
    select: { ts: true, v1: true, mid: true, v2: true },
  });
  return rows.reverse();
}

/** 페이지 SSR helper — odds + history 한 번에 반환. row 없으면 null. */
export async function loadBaseballOdds(matchId: number): Promise<{
  odds: BaseballLiveOdds;
  history: BaseballOddsHistoryPoint[];
} | null> {
  const [eu, asia, bs] = await Promise.all([
    fetchKind(matchId, "eu", 50),
    fetchKind(matchId, "asia", 1),
    fetchKind(matchId, "bs", 1),
  ]);

  if (eu.length === 0 && asia.length === 0 && bs.length === 0) return null;

  const lastEu = eu[eu.length - 1] ?? null;
  const lastAsia = asia[0] ?? null;
  const lastBs = bs[0] ?? null;

  const h2h = lastEu
    ? { home: lastEu.v1, draw: null, away: lastEu.v2 }
    : null;

  // 야구 런라인: pick 은 odds 가 낮은 쪽 = 강팀 (-line).
  const spread =
    lastAsia && lastAsia.mid != null
      ? {
          line: Math.abs(lastAsia.mid),
          pick: (lastAsia.v1 < lastAsia.v2 ? "HOME" : "AWAY") as "HOME" | "AWAY",
          homeOdds: lastAsia.v1,
          awayOdds: lastAsia.v2,
        }
      : null;

  const totals =
    lastBs && lastBs.mid != null
      ? { line: lastBs.mid, over: lastBs.v1, under: lastBs.v2 }
      : null;

  const fetchedAt = Math.max(
    lastEu?.ts ?? 0,
    lastAsia?.ts ?? 0,
    lastBs?.ts ?? 0,
  ) * 1000;

  // history — eu 만. sparkline 은 머니라인 흐름.
  const history: BaseballOddsHistoryPoint[] = eu.map((r) => ({
    fetchedAt: r.ts * 1000,
    home: r.v1,
    draw: null,
    away: r.v2,
  }));

  return {
    odds: {
      h2h,
      totals,
      spread,
      bookmakers: 1,
      fetchedAt: fetchedAt || Date.now(),
    },
    history,
  };
}
