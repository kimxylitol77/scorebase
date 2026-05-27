// GET /api/cron/baseball-standings
// api-baseball (api-sports) 의 야구 standings 일 1회 fetch → ApiFootballStandingsCache 재활용.
// (rows JSON 구조가 동일해 별도 모델 불필요. league key 로 KBO/NPB/MLB/CPBL 구분.)
//
// Vercel cron 등록 (vercel.json) 또는 수동 호출.
// auth: CRON_SECRET 또는 INTERNAL_API_TOKEN bearer.
//
// 응답: { ok, leagues: [{ league, rows, error? }] }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AB_BASE = "https://v1.baseball.api-sports.io";

// 우리 league code → api-baseball league id.
const LEAGUE_AB_ID: Record<string, number> = {
  KBO: 5,
  NPB: 2,
  MLB: 1,
  CPBL: 29,
  // LMB 추가 가능 (확인 시): id 미정 — 별도 확인 후 etend.
};

interface AbStandingRow {
  position?: number;
  team?: { id?: number; name?: string };
  points?: number;
  games?: {
    win?: { total?: number };
    lose?: { total?: number };
  };
}

interface AbResponse {
  results?: number;
  response?: AbStandingRow[][];
  errors?: unknown;
}

async function fetchStandings(apiKey: string, leagueId: number, season: number): Promise<AbStandingRow[] | null> {
  try {
    const r = await fetch(
      `${AB_BASE}/standings?league=${leagueId}&season=${season}`,
      { headers: { "x-apisports-key": apiKey }, signal: AbortSignal.timeout(20_000) },
    );
    if (!r.ok) return null;
    const d = (await r.json()) as AbResponse;
    const g = d.response?.[0];
    if (!Array.isArray(g)) return null;
    return g;
  } catch (e) {
    console.warn(`[baseball-standings] fetch fail league=${leagueId}:`, (e as Error).message);
    return null;
  }
}

function unauthorized(msg = "Unauthorized") {
  return NextResponse.json({ error: msg }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const cronOk = process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  const intOk = process.env.INTERNAL_API_TOKEN && auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  const ua = req.headers.get("user-agent") ?? "";
  const vercelCron = ua.includes("vercel-cron");
  if (!cronOk && !intOk && !vercelCron) return unauthorized();

  const apiKey = process.env.API_BASEBALL_KEY;
  if (!apiKey) return NextResponse.json({ error: "API_BASEBALL_KEY 미설정" }, { status: 500 });

  const year = new Date().getUTCFullYear();
  const results: Array<{ league: string; saved?: number; error?: string }> = [];

  for (const [league, leagueId] of Object.entries(LEAGUE_AB_ID)) {
    const rows = await fetchStandings(apiKey, leagueId, year);
    if (!rows) {
      results.push({ league, error: "fetch fail" });
      continue;
    }
    // ApiFootballStandingsCache 형식에 맞춰 가벼운 rows 로 변환.
    // draw=0 명시 (야구는 무승부 거의 없음, 호출 측이 draw undefined 가정으로 깨지지 않게).
    const lightRows = rows.map((r) => ({
      position: r.position,
      teamExternalId: r.team?.id ? String(r.team.id) : null,
      teamName: r.team?.name,
      points: r.points,
      won: r.games?.win?.total ?? 0,
      draw: 0,
      loss: r.games?.lose?.total ?? 0,
    }));
    try {
      await prisma.apiFootballStandingsCache.upsert({
        where: { league },
        create: {
          league,
          season: year,
          rows: lightRows as unknown as Prisma.InputJsonValue,
        },
        update: {
          season: year,
          rows: lightRows as unknown as Prisma.InputJsonValue,
        },
      });
      results.push({ league, saved: lightRows.length });
    } catch (e) {
      results.push({ league, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, leagues: results });
}
