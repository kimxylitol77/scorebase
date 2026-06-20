// POST /api/internal/lol-matches
// Lightsail worker(lol-collector.js)가 TheSports lol/match/tournament raw 매치를 batch POST → upsert.
// TheSports IP whitelist 로 Vercel 직접 호출 불가 → 고정 IP 워커가 호출하고 결과만 여기로 push.
// Bearer auth: env INTERNAL_API_TOKEN.
//
// Body: { matches: TsLolMatch[] }  — TheSports /v1/lol/match/tournament results 원본 그대로
// 흐름: normalizeLolMatches(매핑·status 변환) → upsertMatch(Team name-fuzzy 통합 + dedup + status guard)

import { NextRequest, NextResponse } from "next/server";
import {
  normalizeLolMatches,
  type TsLolMatch,
} from "@/lib/sports/lol-thesports";
import { upsertMatch } from "@/jobs/collect";
import { recordCronRun } from "@/lib/cron-registry";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.INTERNAL_API_TOKEN) {
    return NextResponse.json({ error: "INTERNAL_API_TOKEN unset" }, { status: 401 });
  }
  if (auth !== `Bearer ${process.env.INTERNAL_API_TOKEN}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { matches?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.matches)) {
    return NextResponse.json({ error: "matches array required" }, { status: 400 });
  }

  const normalized = normalizeLolMatches(body.matches as TsLolMatch[]);
  let upserted = 0;
  let failed = 0;
  for (const m of normalized) {
    try {
      await upsertMatch(m);
      upserted++;
    } catch (e) {
      failed++;
      console.error(`[lol-matches] ${m.externalId}: ${(e as Error).message}`);
    }
  }

  // dead-man's switch — 워커가 0건 POST 해도 "실행됨" 기록(휴식기 오탐 방지).
  await recordCronRun("lol-collect", { ok: failed === 0, count: upserted });

  return NextResponse.json({
    ok: true,
    received: body.matches.length,
    normalized: normalized.length,
    upserted,
    failed,
  });
}
