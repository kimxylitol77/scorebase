// POST /api/internal/football-transfers
// Lightsail worker (football-transfers-cron) 가 TheSports transfer/list?time= 증분 응답을 push.
// Bearer auth: INTERNAL_API_TOKEN.
//
// body: { transfers: TsTransfer[] } — ts 원본 row 그대로.
// league 매핑은 서버가: ① 빅5 — TeamSourceId(thesports)→Team.league 동적
//                      ② 확장 리그 — data/transfer-league-teams.json (K리그1·사우디·MLS)
// to_team 우선(도착 리그), 미매칭이면 from_team. 둘 다 미매칭은 skip (비커버 리그 이적).
// upsert — 같은 이적의 fee/desc/type 정정(updated_at 증분) 반영. 기존 league 는 유지.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import expansionTeams from "../../../../../data/transfer-league-teams.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BIG5 = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1"];
const EXPANSION: Record<string, string> = expansionTeams as Record<string, string>;

interface TsTransfer {
  id?: string; player_id?: string;
  from_team_id?: string; from_team_name?: string;
  to_team_id?: string; to_team_name?: string;
  transfer_type?: number; transfer_time?: number; transfer_fee?: number; transfer_desc?: string;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { transfers?: TsTransfer[] };
  try {
    body = (await req.json()) as { transfers?: TsTransfer[] };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.transfers)) {
    return NextResponse.json({ error: "transfers must be an array" }, { status: 400 });
  }

  // 빅5 ts 팀 → league 동적 매핑 (요청당 1회, ~150 rows)
  const big5Rows = await prisma.teamSourceId.findMany({
    where: { source: "thesports", team: { league: { in: BIG5 } } },
    select: { externalId: true, team: { select: { league: true } } },
  });
  const teamLeague = new Map<string, string>(Object.entries(EXPANSION));
  for (const r of big5Rows) teamLeague.set(r.externalId, r.team.league); // 빅5 가 사전보다 우선

  let upserted = 0;
  let skippedUncovered = 0;
  let skippedInvalid = 0;
  for (const t of body.transfers) {
    if (!t.id || !t.player_id) { skippedInvalid++; continue; }
    const league =
      (t.to_team_id && teamLeague.get(t.to_team_id)) ||
      (t.from_team_id && teamLeague.get(t.from_team_id)) ||
      null;
    if (!league) { skippedUncovered++; continue; }
    try {
      await prisma.footballTransfer.upsert({
        where: { id: t.id },
        create: {
          id: t.id, playerId: t.player_id,
          fromTeamId: t.from_team_id || null, fromTeamName: t.from_team_name || null,
          toTeamId: t.to_team_id || null, toTeamName: t.to_team_name || null,
          transferType: t.transfer_type ?? null, transferTime: t.transfer_time ?? null,
          transferFee: t.transfer_fee ?? null, transferDesc: t.transfer_desc || null,
          league,
        },
        update: {
          fromTeamId: t.from_team_id || null, fromTeamName: t.from_team_name || null,
          toTeamId: t.to_team_id || null, toTeamName: t.to_team_name || null,
          transferType: t.transfer_type ?? null, transferTime: t.transfer_time ?? null,
          transferFee: t.transfer_fee ?? null, transferDesc: t.transfer_desc || null,
          // league 는 기존 유지 — 백필 태깅을 증분이 덮지 않도록 (도착/출발 우선순위 동일하면 결과 동일)
        },
      });
      upserted++;
    } catch {
      skippedInvalid++;
    }
  }

  return NextResponse.json({ ok: true, upserted, skippedUncovered, skippedInvalid });
}
