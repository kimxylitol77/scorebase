// GET /api/match-sim?matchId= — 단일 경기 5,000회 시뮬 (표시 확률 주사위 + 종목 엔진 스코어 분포)
// 회원 봇 손잡이 확장: &kElo=..&kForm=..&kHome=..&kMarket=..&kUnderdog=.. (% 단위 0~200, 기본 100)
// 하나라도 전달되면 커스텀 확률로 주사위 — 무파라미터 호출은 종전과 동일.
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { simulateMatch } from "@/lib/predict/match-sim";
import { clampKnobs, type BotKnobs } from "@/lib/predict/member-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`match-sim:${ip}`, {
    max: 30,
    windowMs: 60_000,
    lockMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "too many requests" },
      { status: 429 },
    );
  }

  const matchId = Number(req.nextUrl.searchParams.get("matchId"));
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return NextResponse.json(
      { ok: false, error: "matchId 필요" },
      { status: 400 },
    );
  }

  // 손잡이 파라미터 (% → 배율). 하나도 없으면 undefined — 기존 경로 그대로.
  const sp = req.nextUrl.searchParams;
  const knobKeys = ["kElo", "kForm", "kHome", "kMarket", "kUnderdog"] as const;
  let knobs: BotKnobs | undefined;
  if (knobKeys.some((k) => sp.has(k))) {
    const pct = (k: (typeof knobKeys)[number]) => {
      const raw = sp.get(k);
      if (raw == null || raw === "") return 1; // 미전달 손잡이 = 100%
      const v = Number(raw);
      return Number.isFinite(v) ? v / 100 : 1;
    };
    knobs = clampKnobs({
      elo: pct("kElo"),
      form: pct("kForm"),
      home: pct("kHome"),
      market: pct("kMarket"),
      underdog: pct("kUnderdog"),
    });
  }

  const result = await simulateMatch(matchId, knobs);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
