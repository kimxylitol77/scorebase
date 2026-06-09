// GET  /api/internal/stale-ts-verify — stale ts- SCHEDULED 매치 목록 (TheSports diary verify 대상).
// POST /api/internal/stale-ts-verify — 고정 IP worker 가 diary verify 한 결과를 적용 (FINISHED/POSTPONED sync).
//
// 배경:
//   cleanup-stale-scheduled cron 은 Vercel(동적 IP)이라 TheSports(IP 화이트리스트) 호출 불가.
//   → externalId 가 "ts-" prefix 인 매치(NPB/CHILE_PB/CANADA_PL 등)는 거기서 verify 못 하고
//     매번 KEPT 로 쌓인다. 고정 IP worker(mac-mini, 화이트리스트 등록)가 이 endpoint 로
//     대상 목록을 받아 baseball/football diary 로 verify 한 뒤 결과를 되돌려 준다.
//
// 매핑 단일 진실: status_id → MatchStatus 변환은 worker 에서 하지 않고 여기서
//   mapBaseballStatus / mapFootballStatus 재사용 (worker .js 는 src/lib import 불가).
//   worker 는 diary 의 raw statusId/score 만 추출해 보낸다.
//
// auth: Bearer INTERNAL_API_TOKEN.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import {
  BASEBALL_LEAGUES,
  HOCKEY_LEAGUES,
  BASKETBALL_LEAGUES,
} from "@/lib/sports/sport-leagues";
import { mapBaseballStatus } from "@/lib/sports/thesports/status-codes";
import { mapFootballStatus } from "@/lib/sports/thesports/football-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_HOURS = 6;

// ts- 매치 sport 분류 — baseball / football diary 만 verify 대상.
// 하키/농구 ts- 매치는 diary 스킴이 달라 현재 제외 (worker 가 football 로 오조회하지 않도록 null).
type VerifySport = "baseball" | "football";
function sportForLeague(league: string): VerifySport | null {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (HOCKEY_LEAGUES.has(league) || BASKETBALL_LEAGUES.has(league)) return null;
  return "football";
}

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
function authed(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") ?? "";
  return (
    !!process.env.INTERNAL_API_TOKEN &&
    auth === `Bearer ${process.env.INTERNAL_API_TOKEN}`
  );
}

// ── GET: verify 대상 목록 ───────────────────────────────────
export async function GET(req: NextRequest) {
  if (!authed(req)) return unauthorized();

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const stale = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { lt: cutoff },
      externalId: { startsWith: "ts-" },
    },
    select: { id: true, league: true, externalId: true, startTime: true },
    orderBy: { startTime: "asc" },
  });

  const matches = stale
    .map((m) => {
      const sport = sportForLeague(m.league);
      if (!sport) return null; // 하키/농구 ts- → verify 제외
      return {
        matchId: m.id,
        league: m.league,
        tsMatchId: m.externalId.slice(3), // "ts-" 제거
        startTimeMs: m.startTime.getTime(),
        sport,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ staleHours: STALE_HOURS, count: matches.length, matches });
}

// ── POST: worker 의 diary verify 결과 적용 ──────────────────
interface VerifyResult {
  matchId: number;
  found: boolean; // diary results 에 tsMatchId 존재 여부
  statusId?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
}
interface PostBody {
  results: VerifyResult[];
}

export async function POST(req: NextRequest) {
  if (!authed(req)) return unauthorized();

  let body: PostBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!Array.isArray(body.results)) {
    return NextResponse.json({ error: "results array required" }, { status: 400 });
  }

  const ids = body.results.map((r) => r.matchId).filter((n) => Number.isInteger(n));
  const rows = await prisma.match.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      league: true,
      status: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  const byId = new Map(rows.map((m) => [m.id, m]));

  type Row = (typeof rows)[number];
  const finished: Row[] = [];
  const postponed: Row[] = [];
  const kept: Row[] = [];
  let skipped = 0; // 매치 없음 또는 이미 SCHEDULED 아님 (race)

  for (const r of body.results) {
    const m = byId.get(r.matchId);
    if (!m) {
      skipped++;
      continue;
    }
    // 단조 가드 — worker GET 이후 다른 경로(collect 등)가 이미 처리했으면 건드리지 않음.
    if (m.status !== "SCHEDULED") {
      skipped++;
      continue;
    }
    const sport = sportForLeague(m.league);
    if (!sport) {
      kept.push(m);
      continue;
    }

    // diary 에 해당 매치가 없음 = 취소/일정변경 → POSTPONED.
    if (!r.found) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "POSTPONED" } });
      postponed.push(m);
      continue;
    }

    const mapped =
      r.statusId == null
        ? "SCHEDULED"
        : sport === "baseball"
          ? mapBaseballStatus(r.statusId)
          : mapFootballStatus(r.statusId);

    if (mapped === "FINISHED") {
      await prisma.match.update({
        where: { id: m.id },
        data: {
          status: "FINISHED",
          homeScore: r.homeScore ?? undefined,
          awayScore: r.awayScore ?? undefined,
        },
      });
      finished.push(m);
    } else if (mapped === "POSTPONED") {
      await prisma.match.update({ where: { id: m.id }, data: { status: "POSTPONED" } });
      postponed.push(m);
    } else {
      // LIVE(진행중) / SCHEDULED(status_id 0·1 미시작 — 연기 애매) → 유지, 다음 run 재시도.
      kept.push(m);
    }
  }

  const changed = finished.length + postponed.length;

  // HealthCheck row — /admin/health (category=stale-ts-verify) 노출.
  await prisma.healthCheck.create({
    data: {
      severity: postponed.length >= 5 ? "MED" : changed > 0 ? "LOW" : "OK",
      category: "stale-ts-verify",
      key: "summary",
      message:
        changed > 0
          ? `ts- stale verify — FINISHED ${finished.length}, POSTPONED ${postponed.length}, KEPT ${kept.length}`
          : `ts- stale verify — 변경 없음 (KEPT ${kept.length}, skipped ${skipped})`,
      metadata: {
        finished: finished.length,
        postponed: postponed.length,
        kept: kept.length,
        skipped,
        sample: [...finished, ...postponed].slice(0, 10).map((m) => ({
          id: m.id,
          league: m.league,
          teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
          startTime: m.startTime.toISOString(),
          result: finished.includes(m) ? "FINISHED" : "POSTPONED",
        })),
      },
    },
  });

  // 변경 있을 때만 텔레그램 알림.
  if (changed > 0) {
    const lines = [...finished, ...postponed]
      .slice(0, 10)
      .map((m) => {
        const tag = finished.includes(m) ? "FT" : "PST";
        return `  [${tag}] ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`;
      })
      .join("\n");
    try {
      await sendTelegram(
        `🛰️ <b>ts- stale verify ${changed}건 정리</b> (FINISHED ${finished.length} / POSTPONED ${postponed.length})\n\n` +
          `📍 <b>무엇</b>: TheSports(ts-) stale SCHEDULED 매치 diary 검증\n` +
          `💥 <b>영향</b>: Vercel cron 이 IP 화이트리스트로 못 보던 ts- 매치 자동 정정\n` +
          `🔍 <b>출처</b>: mac-mini worker (고정 IP) → baseball/football diary\n\n` +
          `<code>${lines}</code>\n\n` +
          `➡️ <b>확인</b>: scorebase.kr/admin/health (category=stale-ts-verify)\n\n` +
          `<code>[안내] stale-ts-verify (worker)</code>`,
      );
    } catch (e) {
      console.warn("[stale-ts-verify] telegram fail:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    finished: finished.length,
    postponed: postponed.length,
    kept: kept.length,
    skipped,
  });
}
