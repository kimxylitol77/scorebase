// /api/live/lol/[matchId]?date=YYYY-MM-DD — BALLDONTLIE 매치 정규화.
// 단일 매치 endpoint 가 없어 dates+tournament_ids 로 list fetch 후 id 매칭.
// Edge runtime · ETag · 10s polling target.

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const BDL_BASE = "https://api.balldontlie.io";
// LOL 라이브 추적 tournament — LCK 본선·2군 + 해외(LPL/LEC/LCS). lol.ts TOURNAMENT_TO_LEAGUE 와 동기.
// (edge runtime — lol.ts 는 axios import 라 직접 import 불가 → ID 만 로컬 복제)
const LOL_TOURNAMENT_IDS = [324, 31757, 30626, 19349, 35115, 328, 336, 323, 337];
const TIMEOUT = 8000;

export interface LolLive {
  matchId: number;
  status: "PRE" | "LIVE" | "FINAL";
  bestOf: 3 | 5;
  /** team1 = home, team2 = away (collector 매핑) */
  homeScore: number;
  awayScore: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  tournament: {
    id: number;
    name: string;
    tier?: string;
    status?: string;
  };
  startDate: string;
  /** 현재 진행 중인 게임 번호 (1부터). FINAL 이면 마지막 게임 번호. */
  currentGame: number;
  /** 시리즈 승리에 필요한 게임 수 (BO3=2, BO5=3) */
  needToWin: number;
}

interface BdlLolMatch {
  id: number;
  slug: string;
  tournament: { id: number; name: string; tier?: string; status?: string };
  team1: { id: number; name: string } | null;
  team2: { id: number; name: string } | null;
  team1_score: number | null;
  team2_score: number | null;
  bo_type: number;
  status: string; // "upcoming" | "current" | "finished"
  start_date: string;
}

function normalize(m: BdlLolMatch): LolLive | null {
  if (!m.team1 || !m.team2) return null;
  const status: LolLive["status"] =
    m.status === "current" ? "LIVE" : m.status === "finished" ? "FINAL" : "PRE";
  const bestOf: 3 | 5 = m.bo_type === 5 ? 5 : 3;
  const t1 = m.team1_score ?? 0;
  const t2 = m.team2_score ?? 0;
  return {
    matchId: m.id,
    status,
    bestOf,
    homeScore: t1,
    awayScore: t2,
    homeTeam: m.team1,
    awayTeam: m.team2,
    tournament: m.tournament,
    startDate: m.start_date,
    currentGame: status === "FINAL" ? t1 + t2 : t1 + t2 + 1,
    needToWin: Math.ceil(bestOf / 2),
  };
}

async function hashLive(live: LolLive): Promise<string> {
  const sig = `${live.status}|${live.homeScore}|${live.awayScore}|${live.currentGame}`;
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
  ctx: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await ctx.params;
  const id = Number(matchId);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid match id" }, { status: 400 });
  }
  const date = req.nextUrl.searchParams.get("date"); // KST yyyy-mm-dd
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "missing date" }, { status: 400 });
  }
  const key = process.env.BALLDONTLIE_KEY;
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 200 });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    // 해외 리그는 표준시 차이로 매치 날짜가 ±1일 KST 에 걸칠 수 있어 window 조회 (id 로 정확 매칭).
    const dates = [-1, 0, 1].map((o) => {
      const d = new Date(`${date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + o);
      return d.toISOString().slice(0, 10);
    });
    const dateQs = dates.map((d) => `dates[]=${d}`).join("&");
    const tourQs = LOL_TOURNAMENT_IDS.map((t) => `tournament_ids[]=${t}`).join("&");
    const res = await fetch(
      `${BDL_BASE}/lol/v1/matches?${dateQs}&${tourQs}&per_page=100`,
      {
        headers: { Authorization: key },
        signal: ctrl.signal,
        cache: "no-store",
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { data?: BdlLolMatch[] };
    const found = (data.data ?? []).find((m) => m.id === id);
    if (!found) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const live = normalize(found);
    if (!live) {
      return NextResponse.json({ error: "not ready" }, { status: 200 });
    }
    const etag = `W/"${await hashLive(live)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        },
      });
    }
    return NextResponse.json(
      { live, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
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
