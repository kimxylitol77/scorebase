// /api/live/mlb/[gameId] — ESPN MLB summary 정규화 endpoint.
// 이닝별 linescore + 베이스 상황 + B/S/O + 투수/타자 + 마지막 플레이.
// Edge runtime · 캐시 10초 + SWR 30 · ETag 지원.

import { NextResponse, type NextRequest } from "next/server";
import { fetchLiveOdds, type LiveOddsSnapshot } from "@/lib/odds/live-odds";

// nodejs runtime — fetchLiveOdds (fetch 기반) 통합용
export const runtime = "nodejs";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb";
const TIMEOUT = 8000;

export interface MlbLive {
  status: string; // "PRE" | "LIVE" | "FINAL" | "DELAY"
  statusLabel: string; // "Top 5th" 등 원문
  /** 이닝별 점수 (1~9, 연장 포함). away 가 항상 먼저. */
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  awayTeam: { id: string; name: string; abbreviation: string; score: number; logo?: string };
  liveOdds?: LiveOddsSnapshot | null;
  situation: {
    balls: number | null;
    strikes: number | null;
    outs: number | null;
    onFirst: boolean;
    onSecond: boolean;
    onThird: boolean;
    batterName: string | null;
    pitcherName: string | null;
    lastPlay: string | null;
  } | null;
}

// ESPN summary는 매우 큰 응답이지만 우리가 필요한 필드는 한정 — 좁은 타입 선언.
interface EspnSummary {
  header?: {
    competitions?: Array<{
      status?: {
        type?: { name?: string; shortDetail?: string; state?: string };
      };
      situation?: {
        balls?: number;
        strikes?: number;
        outs?: number;
        onFirst?: boolean;
        onSecond?: boolean;
        onThird?: boolean;
        batter?: { athlete?: { displayName?: string } };
        pitcher?: { athlete?: { displayName?: string } };
        lastPlay?: { text?: string };
      };
      competitors?: Array<{
        id: string;
        homeAway: "home" | "away";
        score: string | number;
        team?: {
          id?: string;
          displayName?: string;
          abbreviation?: string;
          logo?: string;
        };
        // ESPN 은 displayValue (string) 로 제공. value 필드는 보통 없음.
        linescores?: Array<{ value?: number; displayValue?: string }>;
      }>;
    }>;
  };
}

function normalize(data: EspnSummary): MlbLive | null {
  const comp = data.header?.competitions?.[0];
  if (!comp || !comp.competitors) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const stateName = comp.status?.type?.name ?? "";
  // "STATUS_IN_PROGRESS" → "LIVE", "STATUS_FINAL" → "FINAL", "STATUS_SCHEDULED" → "PRE"
  let status: MlbLive["status"] = "PRE";
  if (/IN_PROGRESS/.test(stateName)) status = "LIVE";
  else if (/FINAL/.test(stateName)) status = "FINAL";
  else if (/DELAY|POSTPONED|RAIN/.test(stateName)) status = "DELAY";

  // ESPN linescore: { displayValue: "3", hits, errors } — value 필드는 없음.
  const toInning = (l: { value?: number; displayValue?: string }) => {
    if (typeof l.value === "number") return l.value;
    if (l.displayValue !== undefined) {
      const n = Number(l.displayValue);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const lsHome = home.linescores?.map(toInning) ?? null;
  const lsAway = away.linescores?.map(toInning) ?? null;

  const s = comp.situation;
  const situation: MlbLive["situation"] = s
    ? {
        balls: s.balls ?? null,
        strikes: s.strikes ?? null,
        outs: s.outs ?? null,
        onFirst: !!s.onFirst,
        onSecond: !!s.onSecond,
        onThird: !!s.onThird,
        batterName: s.batter?.athlete?.displayName ?? null,
        pitcherName: s.pitcher?.athlete?.displayName ?? null,
        lastPlay: s.lastPlay?.text ?? null,
      }
    : null;

  return {
    status,
    statusLabel: comp.status?.type?.shortDetail ?? "",
    linescore:
      lsHome && lsAway
        ? {
            home: lsHome,
            away: lsAway,
          }
        : null,
    homeTeam: {
      id: home.team?.id ?? "",
      name: home.team?.displayName ?? "",
      abbreviation: home.team?.abbreviation ?? "",
      score: Number(home.score) || 0,
      logo: home.team?.logo,
    },
    awayTeam: {
      id: away.team?.id ?? "",
      name: away.team?.displayName ?? "",
      abbreviation: away.team?.abbreviation ?? "",
      score: Number(away.score) || 0,
      logo: away.team?.logo,
    },
    situation,
  };
}

async function hashLive(live: MlbLive): Promise<string> {
  const o = live.liveOdds;
  const oddsSig = o
    ? `${o.h2h?.home ?? ""}/${o.h2h?.away ?? ""}/${o.totals?.line ?? ""}/${o.totals?.over ?? ""}/${o.spread?.line ?? ""}`
    : "";
  const sig = [
    live.status,
    live.statusLabel,
    live.homeTeam.score,
    live.awayTeam.score,
    live.situation?.balls,
    live.situation?.strikes,
    live.situation?.outs,
    live.situation?.onFirst,
    live.situation?.onSecond,
    live.situation?.onThird,
    live.situation?.batterName,
    live.situation?.pitcherName,
    live.situation?.lastPlay,
    oddsSig,
  ].join("|");
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sig),
  );
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json(
      { error: "invalid game id" },
      { status: 400 },
    );
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${ESPN_BASE}/summary?event=${gameId}`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as EspnSummary;
    const live = normalize(data);
    if (!live) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // 라이브 odds — MLB 활성 active=true
    live.liveOdds = await fetchLiveOdds("MLB", live.awayTeam.name, live.homeTeam.name);
    const etag = `W/"${await hashLive(live)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      });
    }
    return NextResponse.json(
      { live, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 200 },
    );
  } finally {
    clearTimeout(t);
  }
}
