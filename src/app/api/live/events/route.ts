// /api/live/events?fixture={id} — 단일 fixture events (골/카드/교체/VAR).
// API-Football `/fixtures/events` 호출 후 정규화. CDN 30초 캐시 + SWR 60.
// 라이브 카드 expand 시 lazy fetch 용도.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const AF_BASE = "https://v3.football.api-sports.io";
const TIMEOUT = 8000;

export interface FixtureEvent {
  /** 경기 분 (전반 0~45+, 후반 45~90+) */
  minute: number;
  /** "goal" | "own-goal" | "penalty" | "yellow" | "red" | "subst" | "var" | "other" */
  type: string;
  /** 팀명 (api-football team.name) */
  teamName: string;
  /** 선수 이름 */
  playerName: string;
  /** 추가 정보 (예: 어시스트 선수, VAR 사유) */
  detail?: string;
}

interface AFEventResp {
  response?: Array<{
    time: { elapsed: number; extra: number | null };
    team: { id: number; name: string };
    player: { id: number | null; name: string | null };
    assist: { id: number | null; name: string | null };
    type: string; // "Goal" | "Card" | "subst" | "Var"
    detail: string; // "Normal Goal", "Yellow Card", "Substitution 1" 등
  }>;
}

function classify(type: string, detail: string): string {
  const t = type.toLowerCase();
  const d = detail.toLowerCase();
  if (t === "goal") {
    if (d.includes("own")) return "own-goal";
    if (d.includes("penalty")) return "penalty";
    return "goal";
  }
  if (t === "card") {
    if (d.includes("red")) return "red";
    return "yellow";
  }
  if (t === "subst") return "subst";
  if (t === "var") return "var";
  return "other";
}

export async function GET(req: NextRequest) {
  const fixture = req.nextUrl.searchParams.get("fixture");
  if (!fixture || !/^\d+$/.test(fixture)) {
    return NextResponse.json({ events: [], error: "invalid fixture id" }, { status: 400 });
  }
  // 유료 API(api-football) 프록시 — 임의 fixture id 순회로 쿼터 소진하는 남용 차단.
  // edge isolate 단위 in-memory 한도라 완전하진 않지만 warm 인스턴스 재사용 시 유효.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimit(`live-events:${ip}`, { max: 60, windowMs: 60_000, lockMs: 300_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { events: [], error: "rate limited" },
      { status: 429, headers: { "retry-after": String(rl.retryAfterSec) } },
    );
  }
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return NextResponse.json({ events: [], error: "missing key" }, { status: 200 });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${AF_BASE}/fixtures/events?fixture=${fixture}`, {
      headers: { "x-apisports-key": key },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as AFEventResp;
    const events: FixtureEvent[] = (data.response ?? []).map((e) => ({
      minute: e.time.elapsed + (e.time.extra ?? 0),
      type: classify(e.type, e.detail),
      teamName: e.team.name,
      playerName: e.player.name ?? "",
      detail:
        classify(e.type, e.detail) === "subst" && e.assist.name
          ? `IN: ${e.assist.name}`
          : e.detail,
    }));
    return NextResponse.json(
      { events, fetchedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      { events: [], error: (e as Error).message },
      { status: 200 },
    );
  } finally {
    clearTimeout(t);
  }
}
