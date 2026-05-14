// /api/live/scores — 모든 리그 라이브 매치 통합 endpoint.
// Edge Runtime · CDN s-maxage 15초 + SWR 45초 · ETag/304 지원.
// ?demo=1 으로 호출 시 가짜 매치 list 반환 (디자인 검증용, 캐시 X).

import { NextResponse, type NextRequest } from "next/server";
import { fetchAllLiveScores, type LiveMatch } from "@/lib/sports/live-scores";

export const runtime = "edge";
export const revalidate = 15;

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

// 매치 list → 안정적 hash (점수/상태 바뀔 때만 변동)
async function hashMatches(matches: LiveMatch[]): Promise<string> {
  const sig = matches
    .map(
      (m) =>
        `${m.id}:${m.homeScore}-${m.awayScore}:${m.statusLabel}`,
    )
    .sort()
    .join("|");
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sig),
  );
  // hex 16자만 — ETag 비교에 충분
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    const etag = `W/"${await hashMatches(matches)}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      // 변경 없음 → 빈 body 304 (트래픽 절약)
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
        },
      });
    }
    return NextResponse.json(
      { matches, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
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
