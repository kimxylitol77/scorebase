// 공개 순위 JSON API — 종목 통합 행은 lib/standings/public-standings 가 만든다(임베드 위젯과 공유).
import { NextRequest, NextResponse } from "next/server";
import { buildPublicStandings, PUBLIC_STANDINGS_LEAGUES } from "@/lib/standings/public-standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const league = (request.nextUrl.searchParams.get("league") ?? "EPL").toUpperCase();
  const sport = PUBLIC_STANDINGS_LEAGUES.get(league);
  if (!sport) {
    return NextResponse.json({ error: "unsupported league" }, { status: 400 });
  }

  const result = await buildPublicStandings(league);
  if (result === null) {
    return NextResponse.json({ error: "unsupported league" }, { status: 400 });
  }
  if (result === "unavailable") {
    return NextResponse.json(
      {
        status: "unavailable",
        error: "순위 소스 응답 없음 — 마지막 정상 캐시도 비어 있습니다.",
        league,
        sport,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  const stale = result.status === "stale";
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: result.sourceUpdatedAt?.toISOString() ?? null,
      // ok = 소스 정상, stale = 소스 실패로 마지막 정상 캐시를 돌려준 상태
      status: result.status,
      league: result.league,
      leagueLabel: result.leagueLabel,
      sport: result.sport,
      metric: result.metric,
      rows: result.rows,
    },
    {
      headers: {
        // stale 응답을 CDN 에 오래 물리면 소스 복구 후에도 옛 순위가 계속 나간다.
        "cache-control": stale
          ? "public, max-age=30, s-maxage=60"
          : "public, max-age=60, s-maxage=600, stale-while-revalidate=1800",
      },
    },
  );
}
