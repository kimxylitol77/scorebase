// /api/live/scores — 모든 리그 라이브 매치 통합 endpoint.
// Vercel Data Cache 30초 revalidate (서버 캐시) + 클라이언트 polling 60초.

import { NextResponse } from "next/server";
import { fetchAllLiveScores } from "@/lib/sports/live-scores";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
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
