// Cloudbet sportsbook API — LoL/esports odds (primary, Pinnacle fallback).
// 문서: https://docs.cloudbet.com/
// 인증: header "X-API-Key: {key}". 무료 (Cloudbet 가입 후 발급).
//
// 환경변수 CLOUDBET_KEY 없으면 graceful 실패 (빈 배열 반환) → Pinnacle fallback 으로 자동 전환.

import axios from "axios";

const BASE = "https://sports-api.cloudbet.com/pub/v2";

function authHeader(): Record<string, string> | null {
  const key = process.env.CLOUDBET_KEY;
  if (!key) return null;
  return { "X-API-Key": key };
}

export interface CbMatch {
  id: string;
  name: string;
  startTime: string; // ISO
  competition: { key: string; name: string };
  teams: Array<{ name: string; key?: string }>;
  markets: Array<{
    key: string; // 예: "moneyline"
    submarkets?: Record<string, unknown>;
    selections?: Array<{
      outcome: string;
      params?: string;
      price: number; // decimal
    }>;
  }>;
}

interface CbEvent {
  id?: string | number;
  name?: string;
  cutoffTime?: string;
  cutoffAt?: string;
  startTime?: string;
  competition?: { key?: string; name?: string };
  home?: { name?: string };
  away?: { name?: string };
  markets?: Record<string, {
    submarkets?: Record<string, {
      selections?: Array<{
        outcome?: string;
        params?: string;
        price?: number;
        decimalOdds?: number;
      }>;
    }>;
  }>;
}

/** LoL 컴페티션 목록 (LCK 등). */
export async function fetchCloudbetLolCompetitions(): Promise<
  Array<{ key: string; name: string }>
> {
  const hdr = authHeader();
  if (!hdr) return [];
  try {
    const { data } = await axios.get<{
      sports?: Array<{
        key: string;
        categories?: Array<{
          competitions?: Array<{ key: string; name: string }>;
        }>;
      }>;
    }>(`${BASE}/odds/sports/esports-league-of-legends`, {
      headers: hdr,
      timeout: 12000,
    });
    const out: Array<{ key: string; name: string }> = [];
    for (const sp of data.sports ?? []) {
      for (const cat of sp.categories ?? []) {
        for (const cp of cat.competitions ?? []) {
          out.push({ key: cp.key, name: cp.name });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** LCK competition 의 향후 이벤트 + 1X2 moneyline odds. */
export async function fetchCloudbetLckEvents(
  competitionKey: string,
): Promise<
  Array<{
    id: string;
    name: string;
    startTime: string;
    homeName: string;
    awayName: string;
    homeDecimal: number;
    awayDecimal: number;
  }>
> {
  const hdr = authHeader();
  if (!hdr) return [];
  try {
    const { data } = await axios.get<{ events?: CbEvent[] }>(
      `${BASE}/odds/competitions/${competitionKey}`,
      { headers: hdr, timeout: 12000 },
    );
    const out: Array<{
      id: string;
      name: string;
      startTime: string;
      homeName: string;
      awayName: string;
      homeDecimal: number;
      awayDecimal: number;
    }> = [];
    for (const ev of data.events ?? []) {
      const home = ev.home?.name ?? "";
      const away = ev.away?.name ?? "";
      const id = String(ev.id ?? "");
      const startTime = ev.cutoffTime ?? ev.cutoffAt ?? ev.startTime ?? "";
      if (!home || !away || !id) continue;
      // moneyline submarket — "match_winner" 같은 키 (Cloudbet 명세 변동 가능)
      const ml = ev.markets?.["match_winner"]?.submarkets?.["period=0"];
      const sels = ml?.selections ?? [];
      const homeSel = sels.find((s) => s.outcome === "home");
      const awaySel = sels.find((s) => s.outcome === "away");
      const homeDec = homeSel?.decimalOdds ?? homeSel?.price ?? 0;
      const awayDec = awaySel?.decimalOdds ?? awaySel?.price ?? 0;
      if (!homeDec || !awayDec) continue;
      out.push({
        id,
        name: ev.name ?? `${home} vs ${away}`,
        startTime,
        homeName: home,
        awayName: away,
        homeDecimal: homeDec,
        awayDecimal: awayDec,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function isCloudbetEnabled(): boolean {
  return Boolean(process.env.CLOUDBET_KEY);
}
