// /api/live/baseball/[gameId] — KBO/NPB/MLB 공용 api-sports Baseball 정규화.
// api-sports `/games?id={id}` 응답 → 이닝별 linescore + H/E/R + 점수 + 상태.
// 베이스 상황·볼카운트·현재 투수/타자는 api-sports 미제공 (안 A 범위).
// Edge runtime · ETag/304 · CDN 15s + SWR 45s.

import { NextResponse, type NextRequest } from "next/server";
import { fetchLiveOdds, type LiveOddsSnapshot } from "@/lib/odds/live-odds";
import { computeBaseballWpa, type WpaPoint } from "@/lib/live/baseball-wpa";
import { baseballStatusLabel } from "@/lib/sports/live-scores";
import { prisma } from "@/lib/db";

// nodejs runtime — fetchLiveOdds 가 fetch 로 동작하지만 일관성 위해 nodejs 고정
// (edge 도 호환되지만 baseball 응답 크지 않으니 안전한 쪽 선택)
export const runtime = "nodejs";

const AB_BASE = "https://v1.baseball.api-sports.io";
const TIMEOUT = 8000;

// api-sports baseball league.id → 우리 League 코드
// (The Odds API SPORT_KEY 매칭용)
const LEAGUE_BY_AB_ID: Record<number, "KBO" | "NPB" | "MLB"> = {
  5: "KBO",
  2: "NPB",
  1: "MLB",
};

export interface BaseballLive {
  status: "PRE" | "LIVE" | "FINAL" | "DELAY";
  statusLabel: string; // "Inning 6" / "Finished" / "Not Started"
  /** 이닝별 점수 (1~9 + extra) — null = 아직 진행 안 됨 */
  linescore: { home: (number | null)[]; away: (number | null)[] } | null;
  homeTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  awayTeam: {
    name: string;
    score: number;
    hits: number | null;
    errors: number | null;
  };
  league: { id: number; name: string };
  liveOdds?: LiveOddsSnapshot | null;
  wpaSeries?: WpaPoint[] | null;
  /** TheSports detail_live.extra — KBO/NPB 베이스/볼카운트 (cache 있을 때만) */
  liveContext?: {
    bases: string; // "000"~"111"
    outs: number;  // 0~2
    good: number | null;
    bad: number | null;
  } | null;
}

interface ABGameDetail {
  response?: Array<{
    id: number;
    date: string;
    status: { short: string; long: string };
    league: { id: number; name: string };
    teams: {
      home: { name: string };
      away: { name: string };
    };
    scores: {
      home: BaseballSide;
      away: BaseballSide;
    };
  }>;
}

interface BaseballSide {
  hits: number | null;
  errors: number | null;
  innings: Record<string, number | null>;
  total: number | null;
}

function pickStatus(short: string, long: string): BaseballLive["status"] {
  if (["FT", "POST", "AOT"].includes(short)) return "FINAL";
  if (short === "NS") return "PRE";
  if (["CANC", "PST"].includes(short)) return "DELAY";
  if (/halt|delay|interruption|rain/i.test(long)) return "DELAY";
  return "LIVE";
}

/** "1"~"9" 키를 순서대로 + extra (있을 때만) 배열로 변환 */
function flattenInnings(innings: Record<string, number | null>): (number | null)[] {
  const result: (number | null)[] = [];
  // 정규 9이닝
  for (let i = 1; i <= 9; i++) {
    result.push(innings[String(i)] ?? null);
  }
  // 연장 — extra 가 숫자면 추가 (단일 칸)
  if (innings.extra !== null && innings.extra !== undefined) {
    result.push(innings.extra);
  }
  return result;
}

function normalize(data: ABGameDetail): BaseballLive | null {
  const g = data.response?.[0];
  if (!g) return null;
  return {
    status: pickStatus(g.status.short, g.status.long),
    statusLabel: baseballStatusLabel(g.status.long, g.status.short),
    linescore: {
      home: flattenInnings(g.scores.home.innings),
      away: flattenInnings(g.scores.away.innings),
    },
    homeTeam: {
      name: g.teams.home.name,
      score: g.scores.home.total ?? 0,
      hits: g.scores.home.hits,
      errors: g.scores.home.errors,
    },
    awayTeam: {
      name: g.teams.away.name,
      score: g.scores.away.total ?? 0,
      hits: g.scores.away.hits,
      errors: g.scores.away.errors,
    },
    league: g.league,
  };
}

async function hashLive(live: BaseballLive): Promise<string> {
  const o = live.liveOdds;
  const oddsSig = o
    ? `${o.h2h?.home ?? ""}/${o.h2h?.away ?? ""}/${o.totals?.line ?? ""}/${o.totals?.over ?? ""}/${o.spread?.line ?? ""}`
    : "";
  const lastWp = live.wpaSeries?.[live.wpaSeries.length - 1]?.homeWP;
  const sig = [
    live.status,
    live.statusLabel,
    live.homeTeam.score,
    live.awayTeam.score,
    live.homeTeam.hits,
    live.awayTeam.hits,
    live.linescore?.home.join(","),
    live.linescore?.away.join(","),
    oddsSig,
    lastWp?.toFixed(3),
  ].join("|");
  const buf = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(sig),
  );
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await ctx.params;
  if (!/^\d+$/.test(gameId)) {
    return NextResponse.json({ error: "invalid game id" }, { status: 400 });
  }
  const key = process.env.API_BASEBALL_KEY;
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 200 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${AB_BASE}/games?id=${gameId}`, {
      headers: { "x-apisports-key": key },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as ABGameDetail;
    const live = normalize(data);
    if (!live) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    // 라이브 odds — KBO/NPB/MLB 모두 The Odds API 지원 (활성 active=true 확인 완료)
    const ourLeague = LEAGUE_BY_AB_ID[live.league.id];
    if (ourLeague) {
      live.liveOdds = await fetchLiveOdds(
        ourLeague,
        live.awayTeam.name,
        live.homeTeam.name,
      );
    }
    // WPA 곡선 — 이닝별 누적 점수 기반 Poisson 시뮬
    // 리그별 평균 이닝 득점: KBO 0.53, NPB 0.44, MLB 0.49
    if (live.linescore) {
      const lambda = ourLeague === "KBO" ? 0.53 : ourLeague === "NPB" ? 0.44 : 0.49;
      live.wpaSeries = computeBaseballWpa(
        live.linescore.away,
        live.linescore.home,
        { lambdaPerInning: lambda },
      );
    }
    // TheSports detail_live.extra — KBO/NPB 베이스/볼카운트 (cache 있으면)
    if (live.status === "LIVE") {
      try {
        const ourMatch = await prisma.match.findFirst({
          where: { externalId: gameId },
          select: { id: true },
        });
        if (ourMatch) {
          const cache = await prisma.theSportsMatchCache.findUnique({
            where: { matchId: ourMatch.id },
            select: { detailLive: true },
          });
          const dl = cache?.detailLive as { extra?: { base?: string; out?: number; good?: number; bad?: number } } | null;
          if (dl?.extra) {
            live.liveContext = {
              bases: typeof dl.extra.base === "string" ? dl.extra.base : "000",
              outs: typeof dl.extra.out === "number" ? dl.extra.out : 0,
              good: typeof dl.extra.good === "number" ? dl.extra.good : null,
              bad: typeof dl.extra.bad === "number" ? dl.extra.bad : null,
            };
          }
        }
      } catch {
        // cache 조회 실패는 ignore — 다른 데이터는 정상 응답
      }
    }
    // 라이브 점수 → DB upsert (cron 30분 갭 회피, SSR/list 페이지도 fresh)
    // best-effort: 실패해도 응답에 영향 없음
    if (live.status === "LIVE" || live.status === "FINAL") {
      prisma.match
        .updateMany({
          where: { externalId: gameId },
          data: {
            homeScore: live.homeTeam.score,
            awayScore: live.awayTeam.score,
            status: live.status === "FINAL" ? "FINISHED" : "LIVE",
          },
        })
        .catch(() => {});
    }
    const etag = `W/"${await hashLive(live)}"`;
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10",
        },
      });
    }
    return NextResponse.json(
      { live, fetchedAt: new Date().toISOString() },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, s-maxage=2, stale-while-revalidate=10",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 200 },
    );
  } finally {
    clearTimeout(t);
  }
}
