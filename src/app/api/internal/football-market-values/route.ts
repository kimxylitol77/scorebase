// POST /api/internal/football-market-values
// Lightsail worker (football-market-values-cron) 가 TheSports player/market/list?time= 증분을 push.
// Bearer auth: INTERNAL_API_TOKEN.
//
// body: { players: TsMarketPlayer[] } — ts 원본 row 그대로 ({ id, history:[{market_time,market_value,team_id,age}] }).
// history 마지막(최신) = currentValue·age·teamId. league = 최신 team_id 매핑:
//   ① 빅5 — TeamSourceId(thesports)→Team.league 동적  ② 확장 리그 — transfer-league-teams.json
// 미매칭(비커버 리그) 은 skip — 이적 피드와 동일 커버리지 유지.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import expansionTeams from "../../../../../data/transfer-league-teams.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const EXPANSION: Record<string, string> = expansionTeams as Record<string, string>;

interface TsMarketHist {
  market_time?: number;
  market_value?: number;
  market_value_currency?: string;
  team_id?: string;
  age?: number;
}
interface TsMarketPlayer {
  id?: string;
  history?: TsMarketHist[];
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { players?: TsMarketPlayer[] };
  try {
    body = (await req.json()) as { players?: TsMarketPlayer[] };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: "players must be an array" }, { status: 400 });
  }

  // 빅5 ts 팀 → league 동적 매핑 (요청당 1회) + 확장 리그 사전.
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true, team: { select: { league: true } } },
  });
  const teamLeague = new Map<string, string>(Object.entries(EXPANSION));
  for (const r of big5Rows) teamLeague.set(r.externalId, r.team.league);

  let upserted = 0;
  let skippedUncovered = 0;
  let skippedInvalid = 0;
  for (const p of body.players) {
    if (!p.id || !Array.isArray(p.history) || p.history.length === 0) {
      skippedInvalid++;
      continue;
    }
    // 최신 = market_time 최대 (정렬 보장 안 됨).
    const hist = [...p.history]
      .filter((h) => h && typeof h.market_value === "number")
      .sort((a, b) => (a.market_time ?? 0) - (b.market_time ?? 0));
    if (hist.length === 0) {
      skippedInvalid++;
      continue;
    }
    const last = hist[hist.length - 1];
    const teamId = last.team_id || null;
    const league = (teamId && teamLeague.get(teamId)) || null;
    if (!league) {
      skippedUncovered++;
      continue;
    }
    try {
      const data = {
        currentValue: last.market_value ?? null,
        age: last.age ?? null,
        teamId,
        league,
        history: hist as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
        fetchedAt: new Date(),
      };
      await prisma.playerMarketValue.upsert({
        where: { id: p.id },
        create: { id: p.id, ...data },
        update: data,
      });
      upserted++;
    } catch {
      skippedInvalid++;
    }
  }

  return NextResponse.json({ ok: true, upserted, skippedUncovered, skippedInvalid });
}
