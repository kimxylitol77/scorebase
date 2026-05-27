// POST /api/internal/ts-baseball-players
// Lightsail worker (ts-baseball-players-cron) 가 TheSports baseball player/list 응답을 upsert.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// body: { players: TSPlayer[] }
// team_id → sport 자동 매핑 (baseball-team-id-mapping.json). 매핑 miss 인 선수는 skip.
// nameKo 는 적재 시점에 toKoreanPlayerName 으로 한 번 계산.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toKoreanPlayerName } from "@/lib/player-names";
import baseballTeamMapping from "@/lib/sports/thesports/baseball-team-id-mapping.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// tsTeamId → sport ("KBO"|"NPB"|"MLB") lookup table.
// baseball-team-id-mapping.json 의 ourLeague 가 진실 — 새 팀 추가 시 자동 반영.
const TS_TEAM_TO_SPORT: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const row of baseballTeamMapping as Array<{ tsId: string; ourLeague: string }>) {
    if (row.tsId && row.ourLeague) m.set(row.tsId, row.ourLeague);
  }
  return m;
})();

interface IncomingPlayer {
  id: string;
  name: string;
  short_name?: string;
  team_id?: string;
  position?: string;
  // 확장 (2026-05-27): Lightsail kbo-player-names-cron 가 Anthropic 음역 결과 직접 명시.
  // team_id 빈/누락 매핑 케이스 (TheSports player/list?uuid 응답이 team_id="" 인 KBO 신규
  // 선수) 에서도 sport 명시로 upsert 가능.
  nameKo?: string;
  sport?: string;
}

interface Body {
  players: IncomingPlayer[];
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!Array.isArray(body.players)) {
    return NextResponse.json({ error: "players must be an array" }, { status: 400 });
  }

  let upserted = 0;
  let skippedNoTeam = 0;
  let skippedOtherSport = 0;
  let skippedError = 0;
  for (const p of body.players) {
    if (!p?.id || !p?.name) {
      skippedNoTeam++;
      continue;
    }
    // sport: incoming 명시 > team_id 매핑. 둘 다 없으면 skip.
    const sport = p.sport ?? (p.team_id ? TS_TEAM_TO_SPORT.get(p.team_id) : undefined);
    if (!sport) {
      // team_id 없고 sport 명시도 없으면 skipNoTeam, team_id 있는데 매핑 miss 면 otherSport
      if (!p.team_id) skippedNoTeam++;
      else skippedOtherSport++;
      continue;
    }
    // nameKo 우선순위: incoming 명시 (Anthropic 음역) > toKoreanPlayerName dictionary > null.
    // dictionary miss 시 toKoreanPlayerName 은 원문 반환 → 영문 그대로면 nameKo null 처리.
    let nameKo: string | null = null;
    if (p.nameKo && /[가-힣]/.test(p.nameKo)) {
      nameKo = p.nameKo;
    } else {
      const converted = toKoreanPlayerName(p.name);
      if (/[가-힣]/.test(converted)) nameKo = converted;
    }
    try {
      await prisma.theSportsPlayer.upsert({
        where: { id: p.id },
        create: {
          id: p.id,
          name: p.name,
          nameKo,
          shortName: p.short_name ?? null,
          teamId: p.team_id || null,
          sport,
          position: p.position ?? null,
        },
        update: {
          name: p.name,
          // nameKo 는 명시 제공 시만 update — 기존 채워진 한글이 덮어쓰이지 않도록.
          ...(nameKo ? { nameKo } : {}),
          shortName: p.short_name ?? null,
          // team_id 가 빈 응답 (player/list?uuid) 이면 기존 teamId 보존.
          ...(p.team_id ? { teamId: p.team_id } : {}),
          sport,
          position: p.position ?? null,
        },
      });
      upserted++;
    } catch {
      skippedError++;
    }
  }

  return NextResponse.json({
    ok: true,
    upserted,
    skippedNoTeam,
    skippedOtherSport,
    skippedError,
  });
}
