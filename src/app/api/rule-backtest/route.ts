// GET /api/rule-backtest — /lab 조건식 시스템 빌더용 피처 튜플.
// 최근 1년 채점 완료 경기(백테스트) + 앞으로 48시간 예정 경기(해당 경기 연결)를 한 번에 돌려주고,
// 클라이언트가 조건을 바꿀 때마다 rule-system.ts 순수함수로 즉석 재채점한다. 로그인 필수(2026-09-17)·회원당 분당 5회 + IP 제한.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUserId } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";
import { buildRuleFeatures, ruleFeatureToTuple, type RuleFeatureTuple, type RuleMatchInput } from "@/lib/predict/rule-system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 365;
/** 폼 계산 재료 — 대상 창보다 앞선 경기가 필요하다 */
const HISTORY_LEAD_DAYS = 60;
const UPCOMING_HOURS = 48;

export interface RuleUpcoming {
  id: number;
  league: string;
  home: string;
  away: string;
  startTime: string;
  href: string;
  f: RuleFeatureTuple;
}

const MATCH_SELECT = {
  id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, startTime: true, homeScore: true, awayScore: true,
  predHome: true, predDraw: true, predAway: true, predCorrect: true,
  marketHome: true, marketAway: true, openingMarketHome: true, openingMarketAway: true,
  oddsHome: true, oddsDraw: true, oddsAway: true,
} as const;

const BASEBALL = new Set(["KBO", "NPB", "MLB"]);
function matchHref(m: { id: number; league: string; externalId: string | null }): string {
  if (BASEBALL.has(m.league)) return m.externalId && /^\d+$/.test(m.externalId) ? `/live/${m.league.toLowerCase()}/${m.externalId}` : `/leagues/${m.league}`;
  return `/live/${m.league.toLowerCase()}/${m.id}`;
}

export async function GET(req: NextRequest) {
  // 로그인 회원 전용 — 1년치 모델 확률·시장 확률·배당 피처를 한 번에 내려주는 라우트라 비회원 스크래핑 문턱을 둔다(2026-09-17).
  // /lab 화면 자체가 회원 전용이라 UX 영향 없음. 회원당 분당 5회.
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const userRl = rateLimit(`rule-backtest:user:${userId}`, { max: 5, windowMs: 60_000, lockMs: 60_000 });
  if (!userRl.allowed) {
    return NextResponse.json({ ok: false, error: "too many requests" }, { status: 429 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`rule-backtest:${ip}`, { max: 10, windowMs: 60_000, lockMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ ok: false, error: "too many requests" }, { status: 429 });

  const t0 = Date.now();
  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const historySince = new Date(since.getTime() - HISTORY_LEAD_DAYS * 86_400_000);
  const until = new Date(now.getTime() + UPCOMING_HOURS * 3_600_000);

  // 대상 = 채점 완료 종료 경기(모델 기준선 있음) + 예정 경기(모델 예측 있음). 히스토리 = 그 리그들의 종료 경기 전부(폼 재료).
  const [finished, upcoming] = await Promise.all([
    prisma.match.findMany({
      where: { status: "FINISHED", predCorrect: { not: null }, startTime: { gte: since } },
      select: MATCH_SELECT,
    }),
    prisma.match.findMany({
      where: { status: "SCHEDULED", predHome: { not: null }, startTime: { gt: now, lte: until } },
      select: { ...MATCH_SELECT, externalId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
      orderBy: { startTime: "asc" },
    }),
  ]);
  const leagues = Array.from(new Set([...finished, ...upcoming].map((m) => m.league)));
  const history = leagues.length
    ? await prisma.match.findMany({
        where: { league: { in: leagues }, status: "FINISHED", startTime: { gte: historySince, lte: now } },
        select: { id: true, league: true, status: true, homeTeamId: true, awayTeamId: true, startTime: true, homeScore: true, awayScore: true },
      })
    : [];

  const targetIds = new Set([...finished, ...upcoming].map((m) => m.id));
  const inputs: RuleMatchInput[] = [
    ...history.filter((h) => !targetIds.has(h.id)),
    ...finished.map((m) => ({ ...m, target: true })),
    ...upcoming.map((m) => ({ ...m, target: true })),
  ];
  const features = buildRuleFeatures(inputs);
  const featById = new Map(features.map((f) => [f.matchId, f]));

  const leagueOf = new Map(finished.map((m) => [m.id, m.league]));
  const byLeague = new Map<string, RuleFeatureTuple[]>();
  for (const f of features) {
    const lg = leagueOf.get(f.matchId);
    if (!lg) continue;
    (byLeague.get(lg) ?? byLeague.set(lg, []).get(lg)!).push(ruleFeatureToTuple(f));
  }
  const upcomingOut: RuleUpcoming[] = upcoming
    .filter((m) => featById.has(m.id))
    .map((m) => ({
      id: m.id,
      league: m.league,
      home: toKoreanTeamName(m.homeTeam.name, m.league) || m.homeTeam.name,
      away: toKoreanTeamName(m.awayTeam.name, m.league) || m.awayTeam.name,
      startTime: m.startTime.toISOString(),
      href: matchHref(m),
      f: ruleFeatureToTuple(featById.get(m.id)!),
    }));

  const body = {
    ok: true,
    since: since.toISOString(),
    days: DAYS,
    leagues: [...byLeague.entries()].map(([league, matches]) => ({ league, n: matches.length, matches })).sort((a, b) => b.n - a.n),
    upcoming: upcomingOut,
    totalMatches: finished.length,
    tookMs: Date.now() - t0,
  };
  const json = JSON.stringify(body);
  return new NextResponse(json, { headers: { "content-type": "application/json", "x-payload-bytes": String(Buffer.byteLength(json)) } });
}
