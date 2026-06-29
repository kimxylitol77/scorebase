// POST /api/internal/lol-ingame
// Lightsail 워커(lol-collector.js)가 mlive=1 매치의 인게임 raw(세트·선수보드·사전)를 batch POST →
// buildLolGames 조립 → Match.lolGames/lolTsMatchId 저장. 픽밴·골드추이·선수 KDA 노출용.
// TheSports IP whitelist 로 Vercel 직접 호출 불가 → 고정 IP 워커가 호출하고 raw 만 여기로 push.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// Body: { sets, players, heroes, equipment, playerNames } — TheSports single/list·player/stat/list 원본
//   + hero/list·equipment/list·player/list 사전. externalId(=ts match_id) 직접 매칭으로 저장.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildLolGames } from "@/lib/sports/lol-ingame";
import { TS_LOL_TEAMS } from "@/lib/sports/lol-thesports";
import { LOL_LEAGUES } from "@/lib/sports/sport-leagues";
import { recordCronRun } from "@/lib/cron-registry";

export const runtime = "nodejs";

type Dict = { id: string; name: string; logo: string };

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    sets?: unknown;
    players?: unknown;
    heroes?: Dict[];
    equipment?: Dict[];
    playerNames?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.sets) || !Array.isArray(body.players)) {
    return NextResponse.json({ error: "sets/players array required" }, { status: 400 });
  }

  const heroMap = new Map<string, { name: string; logo: string }>(
    (body.heroes ?? []).map((h) => [String(h.id), { name: h.name, logo: h.logo }]),
  );
  const eqMap = new Map<string, { name: string; logo: string }>(
    (body.equipment ?? []).map((e) => [String(e.id), { name: e.name, logo: e.logo }]),
  );
  const nameMap = new Map<string, string>(Object.entries(body.playerNames ?? {}));
  const teamMap = new Map(
    Object.entries(TS_LOL_TEAMS).map(([id, v]) => [id, { name: v.name, short: v.short }]),
  );

  const games = buildLolGames(
    body.sets as Array<Record<string, unknown>>,
    body.players as Array<Record<string, unknown>>,
    heroMap,
    eqMap,
    nameMap,
    teamMap,
  );

  // externalId = ts match_id 직접 매칭(TheSports 수집 매치). LOL 계열만.
  let saved = 0;
  let missed = 0;
  for (const [matchId, data] of games) {
    if (!data.sets.length) continue;
    const r = await prisma.match.updateMany({
      where: { externalId: matchId, league: { in: [...LOL_LEAGUES] } },
      data: { lolGames: JSON.stringify(data), lolTsMatchId: matchId },
    });
    if (r.count > 0) saved += r.count;
    else missed++;
  }

  await recordCronRun("lol-ingame", { ok: true, count: saved });

  return NextResponse.json({
    ok: true,
    matchesAssembled: games.size,
    saved,
    missed,
  });
}
