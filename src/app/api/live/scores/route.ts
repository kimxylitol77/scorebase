// /api/live/scores — 모든 리그 라이브 매치 통합 endpoint.
// Edge Runtime · 응답 헤더 기반 CDN 캐시 + ETag/304 지원.
// ?demo=1 으로 호출 시 가짜 매치 list 반환 (디자인 검증용, 캐시 X).
//
// 캐시 정책 (2026-05-23 fix):
//   응답 헤더의 Cache-Control: public, s-maxage=10, must-revalidate 만 사용.
//   `dynamic = "force-dynamic"` 은 Next.js 가 s-maxage 를 strip 해서 CDN 캐시
//   비활성화 → 매 polling 마다 함수 호출 (0.5초). force-dynamic 제거 후 응답
//   헤더가 그대로 전달되어 CDN 이 10초간 캐시 → 함수 호출 ~90% 감소.
//   빈 응답 영구 캐시 회피는 etag 시간 토큰 (hashMatches 의 빈 응답 분기) 으로 cover.

import { NextResponse, type NextRequest } from "next/server";
import { fetchAllLiveScores, type LiveMatch } from "@/lib/sports/live-scores";

export const runtime = "edge";
// dynamic / revalidate 미명시 — fetchAllLiveScores 의 외부 API fetch 로 Next.js
// 가 자동 dynamic 추론. 응답 cache-control 만으로 CDN 캐시 제어.

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
    // 빈 응답에 시간 토큰 섞어 CDN 영구 캐시 회피 (10초 단위로 etag 회전)
    const baseHash = await hashMatches(matches);
    const etagBody =
      matches.length === 0
        ? `${baseHash}-${Math.floor(Date.now() / 10_000)}`
        : baseHash;
    const etag = `W/"${etagBody}"`;
    const ifNoneMatch = req.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      // 변경 없음 → 빈 body 304 (트래픽 절약)
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, must-revalidate",
          // Vercel CDN 전용 — Next.js 가 표준 Cache-Control 의 s-maxage 를 strip 해도
          // Vercel 은 이 헤더를 우선 적용하므로 CDN 캐시 10초 활성 보장.
          "Vercel-CDN-Cache-Control": "max-age=10",
        },
      });
    }
    return NextResponse.json(
      { matches, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=10, must-revalidate",
          // Vercel CDN 전용 — Next.js 가 표준 Cache-Control 의 s-maxage 를 strip 해도
          // Vercel 은 이 헤더를 우선 적용하므로 CDN 캐시 10초 활성 보장.
          "Vercel-CDN-Cache-Control": "max-age=10",
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
