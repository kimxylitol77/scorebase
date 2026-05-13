// /api/live/scores — 모든 리그 라이브 매치 통합 endpoint.
// Vercel Data Cache 30초 revalidate (서버 캐시) + 클라이언트 polling 60초.
// ?demo=1 으로 호출 시 가짜 매치 list 반환 (디자인 검증용, 캐시 X).

import { NextResponse, type NextRequest } from "next/server";
import { fetchAllLiveScores, type LiveMatch } from "@/lib/sports/live-scores";

export const runtime = "nodejs";
export const revalidate = 30;

const DEMO_MATCHES: LiveMatch[] = [
  {
    id: "demo-1",
    league: "EPL",
    leagueLabel: "EPL",
    homeName: "Liverpool",
    awayName: "Manchester United",
    homeShort: "LIV",
    awayShort: "MUN",
    homeScore: 2,
    awayScore: 1,
    statusLabel: "후반 67'",
    startTime: new Date().toISOString(),
  },
  {
    id: "demo-2",
    league: "LALIGA",
    leagueLabel: "라리가",
    homeName: "Real Madrid",
    awayName: "FC Barcelona",
    homeShort: "RM",
    awayShort: "BAR",
    homeScore: 0,
    awayScore: 0,
    statusLabel: "전반 23'",
    startTime: new Date().toISOString(),
  },
  {
    id: "demo-3",
    league: "KBO",
    leagueLabel: "KBO",
    homeName: "LG 트윈스",
    awayName: "두산 베어스",
    homeShort: "LG",
    awayShort: "두산",
    homeScore: 2,
    awayScore: 3,
    statusLabel: "5회 말",
    startTime: new Date().toISOString(),
  },
  {
    id: "demo-4",
    league: "NPB",
    leagueLabel: "NPB",
    homeName: "한신 타이거스",
    awayName: "요미우리 자이언츠",
    homeShort: "한신",
    awayShort: "요미",
    homeScore: 1,
    awayScore: 1,
    statusLabel: "6회 초",
    startTime: new Date().toISOString(),
  },
  {
    id: "demo-5",
    league: "NBA",
    leagueLabel: "NBA",
    homeName: "Boston Celtics",
    awayName: "Los Angeles Lakers",
    homeShort: "BOS",
    awayShort: "LAL",
    homeScore: 82,
    awayScore: 78,
    statusLabel: "3Q 4:23",
    startTime: new Date().toISOString(),
  },
  {
    id: "demo-6",
    league: "UCL",
    leagueLabel: "UCL",
    homeName: "Bayern München",
    awayName: "Inter Milan",
    homeShort: "BAY",
    awayShort: "INT",
    homeScore: 3,
    awayScore: 2,
    statusLabel: "HT",
    startTime: new Date().toISOString(),
  },
];

export async function GET(req: NextRequest) {
  // ?demo=1 → 가짜 매치 (디자인 검증용)
  if (req.nextUrl.searchParams.get("demo") === "1") {
    return NextResponse.json(
      { matches: DEMO_MATCHES, fetchedAt: new Date().toISOString(), demo: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const matches = await fetchAllLiveScores();
    return NextResponse.json(
      { matches, fetchedAt: new Date().toISOString() },
      {
        headers: {
          // CDN 30초 캐시, stale-while-revalidate 60초 (캐시 만료 후에도
          // 1분간 stale 응답을 즉시 주고 백그라운드에서 갱신)
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { matches: [], error: (e as Error).message },
      { status: 200 },
    );
  }
}
