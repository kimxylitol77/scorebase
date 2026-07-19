// GET /api/bot-backtest — 회원 커스텀 봇 백테스트용 피처 벡터 API.
// 과거 채점 완료(predCorrect not null) 경기의 as-of 신호 배열을 1회 반환하고,
// 클라이언트가 손잡이를 바꿀 때마다 member-bot.ts scoreBacktest 로 즉석 재채점한다.
// ?league=MLB (선택, 기본 전 리그) &days=365 (30~730). 로그인 불필요, rate limit 적용.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import type { PredictMatch } from "@/lib/predict/types";
import {
  buildLeagueFeatures,
  featureToTuple,
  leagueConfigOf,
  type BotTargetInput,
} from "@/lib/predict/member-bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_DAYS = 365;

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // 전 리그 응답은 무겁다 — match-sim(30/분)보다 보수적으로
  const rl = rateLimit(`bot-backtest:${ip}`, {
    max: 10,
    windowMs: 60_000,
    lockMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: "too many requests" },
      { status: 429 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const leagueParam = sp.get("league");
  if (leagueParam && !/^[A-Z0-9_]{2,24}$/.test(leagueParam)) {
    return NextResponse.json(
      { ok: false, error: "invalid league" },
      { status: 400 },
    );
  }
  const daysRaw = Number(sp.get("days") ?? DEFAULT_DAYS);
  const days = Number.isFinite(daysRaw)
    ? Math.max(30, Math.min(730, Math.floor(daysRaw)))
    : DEFAULT_DAYS;
  const since = new Date(Date.now() - days * 86_400_000);

  const t0 = Date.now();

  // 1) 타깃 — 모델이 채점한(MIN_PRIOR 가드 통과) 종료 경기만. 기준선(predCorrect)도 함께.
  const targets = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      predCorrect: { not: null },
      startTime: { gte: since },
      ...(leagueParam ? { league: leagueParam } : {}),
    },
    select: {
      id: true,
      league: true,
      homeTeamId: true,
      awayTeamId: true,
      startTime: true,
      homeScore: true,
      awayScore: true,
      homeStarter: true,
      awayStarter: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      marketBookmakers: true,
      predCorrect: true,
    },
    orderBy: { startTime: "asc" },
  });

  if (targets.length === 0) {
    return NextResponse.json({
      ok: true,
      since: since.toISOString(),
      days,
      leagues: [],
      totalMatches: 0,
      tookMs: Date.now() - t0,
    });
  }

  // 2) 리그별 전체 히스토리 (as-of Elo·폼·prior 재구성용 — evaluate 캐시 쿼리와 동일 select)
  const leagueList = Array.from(new Set(targets.map((t) => t.league)));
  const history = await prisma.match.findMany({
    where: { league: { in: leagueList } },
    select: {
      id: true,
      league: true,
      status: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      startTime: true,
    },
  });
  const histByLeague = new Map<string, PredictMatch[]>();
  for (const m of history) {
    const arr = histByLeague.get(m.league);
    if (arr) arr.push(m as PredictMatch);
    else histByLeague.set(m.league, [m as PredictMatch]);
  }

  // 3) 리그별 피처 벡터 + 우리 모델 기준선(predCorrect 평균)
  const leagues = leagueList
    .map((lg) => {
      const lgTargets = targets.filter((t) => t.league === lg);
      const lgInputs: BotTargetInput[] = lgTargets;
      const features = buildLeagueFeatures(
        histByLeague.get(lg) ?? [],
        lgInputs,
        lg,
      );
      const modelHits = lgTargets.filter((t) => t.predCorrect === true).length;
      const cfg = leagueConfigOf(lg);
      return {
        league: lg,
        drawWeight: cfg.drawWeight,
        drawSensitivity: cfg.drawSensitivity,
        marketW0: cfg.marketW0,
        n: features.length,
        modelAcc:
          lgTargets.length > 0
            ? Math.round((modelHits / lgTargets.length) * 1000) / 1000
            : null,
        matches: features.map(featureToTuple),
      };
    })
    .sort((a, b) => b.n - a.n);

  const body = {
    ok: true,
    since: since.toISOString(),
    days,
    leagues,
    totalMatches: targets.length,
    tookMs: Date.now() - t0,
  };
  const json = JSON.stringify(body);
  return new NextResponse(json, {
    headers: {
      "content-type": "application/json",
      "x-payload-bytes": String(Buffer.byteLength(json)),
    },
  });
}
