// Pinnacle (베팅사) public guest API — LoL/esports odds.
// 공식 guest API key 는 page 자체에 노출돼 있어 누구나 read-only odds 조회 가능.
// 다른 베팅사보다 라인 신뢰도 높음 (sharp market).
//
// 한계: LCK 같은 메이저 매치도 보통 시작 12~24시간 전부터 odds 등록.
// → 매치 가까워질 때만 데이터 채워짐. 그 전엔 빈 응답.

import axios from "axios";

const BASE = "https://guest.api.arcadia.pinnacle.com/0.1";
const PUBLIC_KEY = "CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R"; // 공개 guest key
const ESPORTS_SPORT_ID = 12;

const HEADERS = { "X-API-Key": PUBLIC_KEY };

export interface PinMatch {
  id: number;
  league: { id: number; name: string };
  bestOfX?: number;
  participants: Array<{ alignment: "home" | "away"; name: string }>;
}

interface PinRawMatch {
  id: number;
  hasMarkets?: boolean;
  league: { id: number; name: string };
  bestOfX?: number;
  parent?: {
    id: number;
    participants?: Array<{ alignment: string; name: string }>;
  };
  participants?: Array<{ alignment: string; name: string }>;
}

interface PinMarket {
  matchupId: number;
  type: "moneyline" | "spread" | "total" | string;
  period: number;
  status: "open" | "closed" | string;
  isAlternate?: boolean;
  cutoffAt?: string;
  prices: Array<{
    designation: "home" | "away" | "over" | "under";
    price: number; // American odds
    points?: number;
  }>;
}

/** 모든 esports 매치 중 LoL 만 필터. */
export async function fetchPinnacleLolMatches(): Promise<PinMatch[]> {
  try {
    const { data } = await axios.get<PinRawMatch[]>(
      `${BASE}/sports/${ESPORTS_SPORT_ID}/matchups?withSpecials=false`,
      { headers: HEADERS, timeout: 10000 },
    );
    return data
      .filter((m) => {
        const name = m.league?.name ?? "";
        return /League of Legends/i.test(name) && m.hasMarkets;
      })
      .map((m): PinMatch | null => {
        const ps = m.parent?.participants ?? m.participants ?? [];
        const home = ps.find((p) => p.alignment === "home")?.name;
        const away = ps.find((p) => p.alignment === "away")?.name;
        if (!home || !away) return null;
        return {
          id: m.id,
          league: m.league,
          bestOfX: m.bestOfX,
          participants: [
            { alignment: "home", name: home },
            { alignment: "away", name: away },
          ],
        };
      })
      .filter((m): m is PinMatch => m !== null);
  } catch {
    return [];
  }
}

/** 매치의 moneyline (period=0) markets 가져와 American odds 반환. */
export async function fetchPinnacleMoneyline(
  matchupId: number,
): Promise<{ homeAm: number; awayAm: number; cutoffAt?: string } | null> {
  try {
    const { data } = await axios.get<PinMarket[]>(
      `${BASE}/matchups/${matchupId}/markets/related/straight`,
      { headers: HEADERS, timeout: 10000 },
    );
    const ml = data.find(
      (m) => m.type === "moneyline" && m.period === 0 && m.status === "open",
    );
    if (!ml) return null;
    const home = ml.prices.find((p) => p.designation === "home");
    const away = ml.prices.find((p) => p.designation === "away");
    if (!home || !away) return null;
    return {
      homeAm: home.price,
      awayAm: away.price,
      cutoffAt: ml.cutoffAt,
    };
  } catch {
    return null;
  }
}

/** American odds → decimal odds. */
export function americanToDecimal(am: number): number {
  if (am > 0) return 1 + am / 100;
  return 1 + 100 / Math.abs(am);
}

/** vig 제거된 implied probability — 두 outcome (home/away). LoL 무승부 없음. */
export function vigFreeProb(
  homeAm: number,
  awayAm: number,
): { home: number; away: number } {
  const dh = americanToDecimal(homeAm);
  const da = americanToDecimal(awayAm);
  const pH = 1 / dh;
  const pA = 1 / da;
  const sum = pH + pA;
  return {
    home: pH / sum,
    away: pA / sum,
  };
}
