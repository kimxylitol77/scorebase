// GET  /api/internal/stale-ts-verify — stale ts- SCHEDULED/LIVE 매치 목록 (TheSports diary verify 대상).
// POST /api/internal/stale-ts-verify — 고정 IP worker 가 diary verify 한 결과를 적용 (FINISHED/POSTPONED sync).
//
// 배경:
//   cleanup-stale-scheduled cron 은 Vercel(동적 IP)이라 TheSports(IP 화이트리스트) 호출 불가.
//   → externalId 가 "ts-" prefix 인 매치(NPB/CHILE_PB/CANADA_PL 등)는 거기서 verify 못 하고
//     매번 KEPT 로 쌓인다. 고정 IP worker(mac-mini, 화이트리스트 등록)가 이 endpoint 로
//     대상 목록을 받아 baseball/football/ice_hockey diary 로 verify 한 뒤 결과를 되돌려 준다.
//
// 매핑 단일 진실: status_id → MatchStatus 변환은 worker 에서 하지 않고 여기서
//   mapBaseballStatus / mapFootballStatus / mapIceHockeyStatus 재사용 (worker .js 는 src/lib import 불가).
//   worker 는 diary 의 raw statusId/score 만 추출해 보낸다.
//
// auth: Bearer INTERNAL_API_TOKEN.

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { rejectPreviewsForPostponed } from "@/lib/reject-stale-previews";
import {
  BASEBALL_LEAGUES,
  HOCKEY_LEAGUES,
  BASKETBALL_LEAGUES,
  MMA_LEAGUES,
} from "@/lib/sports/sport-leagues";
import { mapBaseballStatus, mapIceHockeyStatus } from "@/lib/sports/thesports/status-codes";
import { mapFootballStatus } from "@/lib/sports/thesports/football-collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_HOURS = 6;
// LIVE 매치는 더 짧게 — 축구 종료(90분+연장+휴식 ~2.5h) 후 빨리 verify.
// ts 군소 축구가 fast-poller(thesports-cache) 누락 시 LIVE 고착하는 공백을 좁힌다
// (2026-06-14 ARG_PRIMERA_NACIONAL #441867 진단). diary status_id 재확인이 가드라
// 야구 연장(3h+) 매치도 진행 중이면 KEPT 로 안전하게 유지된다.
const LIVE_STALE_HOURS = 3;

// ts- 매치 sport 분류 — baseball / football / ice_hockey diary 가 verify 대상.
// 농구 ts- 매치는 diary 스킴이 달라 제외 (worker 가 football 로 오조회하지 않도록 null).
type VerifySport = "baseball" | "football" | "ice_hockey";
function sportForLeague(league: string): VerifySport | null {
  if (BASEBALL_LEAGUES.has(league)) return "baseball";
  if (HOCKEY_LEAGUES.has(league)) return "ice_hockey";
  if (BASKETBALL_LEAGUES.has(league)) return null;
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

  // 미래 매치 LIVE 고착 즉시 롤백 — startTime 이 now+1h 보다 미래인데 LIVE 면
  // 시작 전이라 무조건 오염(ts status_id 글리치/cross-link). diary verify 불필요 —
  // 미래엔 LIVE 일 수 없으므로 SCHEDULED + score null 로 강제 복원.
  // cleanup-stale-scheduled 1b 와 동일 로직을 빠른 layer(worker GET 주기)로 당겨
  // 4h cron 공백을 메운다 (2026-06-20 LMB #532202/#532476 — 16:00 cron 직후 stuck →
  // 다음 20:00 까지 phantom LIVE+score 노출. data-sanity 봇이 cron 보다 빨라 알림).
  // MMA/UFC 제외 — 파이트 카드 startTime 은 추정치라 추정보다 먼저 LIVE 가 정상.
  // 롤백하면 진행 중인 경기를 SCHEDULED 로 되돌려 라이브 노출이 사라짐 (2026-06-21 UFC).
  const futureLiveCutoff = new Date(Date.now() + 60 * 60 * 1000);
  const futureLive = await prisma.match.findMany({
    where: { status: "LIVE", startTime: { gt: futureLiveCutoff }, league: { notIn: [...MMA_LEAGUES] } },
    select: { id: true, league: true, startTime: true, externalId: true },
  });
  let futureLiveRolledBack = 0;
  if (futureLive.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: futureLive.map((m) => m.id) } },
      data: { status: "SCHEDULED", homeScore: null, awayScore: null },
    });
    futureLiveRolledBack = futureLive.length;
    try {
      const lines = futureLive
        .slice(0, 10)
        .map((m) => `  ${m.league} #${m.id} | ${m.externalId} | ${m.startTime.toISOString()}`)
        .join("\n");
      await sendTelegram(
        `⏭ <b>미래 매치 LIVE ${futureLiveRolledBack}건 자동 롤백</b>\n\n` +
          `📍 <b>무엇</b>: startTime 이 1h+ 미래인데 status=LIVE → SCHEDULED + score null\n` +
          `💥 <b>영향</b>: 시작 전 phantom LIVE/score 노출 차단 (4h cron 대기 없이)\n` +
          `🔍 <b>원인</b>: ts status_id 글리치/cross-link 로 미래 매치 LIVE 오염\n\n` +
          `<code>${lines}</code>\n\n` +
          `<code>[안내] stale-ts-verify future_live</code>`,
      );
    } catch (e) {
      console.warn("[stale-ts-verify] future_live telegram fail:", (e as Error).message);
    }
  }

  const schedCutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);
  const liveCutoff = new Date(Date.now() - LIVE_STALE_HOURS * 3600 * 1000);
  const stale = await prisma.match.findMany({
    where: {
      externalId: { startsWith: "ts-" },
      OR: [
        { status: "SCHEDULED", startTime: { lt: schedCutoff } },
        { status: "LIVE", startTime: { lt: liveCutoff } },
      ],
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

  return NextResponse.json({ staleHours: STALE_HOURS, futureLiveRolledBack, count: matches.length, matches });
}

// ── POST: worker 의 diary verify 결과 적용 ──────────────────
interface VerifyResult {
  matchId: number;
  found: boolean; // diary results 에 tsMatchId 존재 여부
  statusId?: number | null;
  homeScore?: number | null;
  awayScore?: number | null;
  /** diary 부재이지만 uuid 조회로 확인된 새 킥오프(unix sec) — 연기가 아니라 일정 이동 */
  rescheduledTo?: number | null;
}
interface PostBody {
  results: VerifyResult[];
}

/**
 * worker 가 보낸 새 킥오프(unix sec)를 적용 가능한 Date 로 — 아니면 null.
 *
 * ts 의 match_time 글리치로 엉뚱한 시각이 들어오면 일정이 통째로 망가지므로 좁게 받는다.
 * 과거로 되돌리는 값(이미 지난 시각)은 stale 해소가 아니라 재발이라 거부하고,
 * 1년을 넘는 이동은 시즌 자체가 다른 값이라 거부한다.
 */
function toRescheduledDate(sec: number | null | undefined, current: Date): Date | null {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return null;
  const ms = sec * 1000;
  if (ms === current.getTime()) return null;
  const now = Date.now();
  if (ms <= now) return null;
  if (ms - now > 365 * 86400_000) return null;
  return new Date(ms);
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
  const rescheduled: Row[] = [];
  const kept: Row[] = [];
  let skipped = 0; // 매치 없음 또는 이미 SCHEDULED 아님 (race)

  for (const r of body.results) {
    const m = byId.get(r.matchId);
    if (!m) {
      skipped++;
      continue;
    }
    // 단조 가드 — worker GET 이후 다른 경로(collect 등)가 이미 처리했으면 건드리지 않음.
    // SCHEDULED·LIVE 만 verify 대상 (FINISHED/POSTPONED 로 이미 확정된 매치는 skip).
    if (m.status !== "SCHEDULED" && m.status !== "LIVE") {
      skipped++;
      continue;
    }
    const sport = sportForLeague(m.league);
    if (!sport) {
      kept.push(m);
      continue;
    }

    // diary 에 해당 매치가 없음.
    //   SCHEDULED → 취소/일정변경으로 POSTPONED.
    //   LIVE → 진행 중이던 매치가 diary 날짜 버킷 밖(자정 경계 이동)일 수 있어 POSTPONED
    //          오판 금지. 유지하고 다음 run 재시도 — 종료되면 FINISHED 버킷에 재등장한다.
    if (!r.found) {
      if (m.status === "LIVE") {
        kept.push(m);
        continue;
      }
      // diary 부재라도 uuid 조회로 새 킥오프가 확인되면 연기가 아니라 일정 이동이다.
      //   POSTPONED 로 굳히면 실제로 열릴 경기가 "연기" 로 남는다
      //   (2026-08-02 GUATEMALA_LN #3931545 — 8/2 → 8/19 이동). startTime 만 옮기고
      //   SCHEDULED 를 유지해 이후 정상 수집 경로를 타게 한다.
      const moved = toRescheduledDate(r.rescheduledTo, m.startTime);
      if (moved) {
        await prisma.match.update({ where: { id: m.id }, data: { startTime: moved } });
        rescheduled.push(m);
        continue;
      }
      await prisma.match.update({ where: { id: m.id }, data: { status: "POSTPONED" } });
      postponed.push(m);
      continue;
    }

    // 하키 status_id=0 = ABNORMAL(Suggest Hiding). ts 가 숨김을 권장한 매치라
    // ice-hockey-match-collector 가 아예 건너뛰어 이미 만들어진 row 는 영영 갱신되지 않는다
    // (2026-08-19 HOCKEY_FRIENDLY 3건이 9~11h stale SCHEDULED 로 고착). 6h+ stale 대상에
    // 한해 POSTPONED 로 확정해 화면 노출을 끊는다.
    if (sport === "ice_hockey" && r.statusId === 0) {
      await prisma.match.update({ where: { id: m.id }, data: { status: "POSTPONED" } });
      postponed.push(m);
      continue;
    }

    const mapped =
      r.statusId == null
        ? "SCHEDULED"
        : sport === "baseball"
          ? mapBaseballStatus(r.statusId)
          : sport === "ice_hockey"
            ? mapIceHockeyStatus(r.statusId)
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

  const changed = finished.length + postponed.length + rescheduled.length;

  // POSTPONED 된 매치의 PUBLISHED PREVIEW 글을 REJECTED 로 내림 (사이트 노출 차단).
  const rejectedPreviews = await rejectPreviewsForPostponed(postponed.map((m) => m.id));

  // HealthCheck row — /admin/health (category=stale-ts-verify) 노출.
  await prisma.healthCheck.create({
    data: {
      severity: postponed.length >= 5 ? "MED" : changed > 0 ? "LOW" : "OK",
      category: "stale-ts-verify",
      key: "summary",
      message:
        changed > 0
          ? `ts- stale verify — FINISHED ${finished.length}, POSTPONED ${postponed.length}, RESCHEDULED ${rescheduled.length}, KEPT ${kept.length}`
          : `ts- stale verify — 변경 없음 (KEPT ${kept.length}, skipped ${skipped})`,
      metadata: {
        finished: finished.length,
        postponed: postponed.length,
        rescheduled: rescheduled.length,
        kept: kept.length,
        skipped,
        sample: [...finished, ...postponed, ...rescheduled].slice(0, 10).map((m) => ({
          id: m.id,
          league: m.league,
          teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
          startTime: m.startTime.toISOString(),
          result: finished.includes(m) ? "FINISHED" : postponed.includes(m) ? "POSTPONED" : "RESCHEDULED",
        })),
      },
    },
  });

  // 변경 있을 때만 텔레그램 알림.
  if (changed > 0) {
    const lines = [...finished, ...postponed, ...rescheduled]
      .slice(0, 10)
      .map((m) => {
        const tag = finished.includes(m) ? "FT" : postponed.includes(m) ? "PST" : "RSC";
        return `  [${tag}] ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`;
      })
      .join("\n");
    try {
      await sendTelegram(
        `🛰️ <b>ts- stale verify ${changed}건 정리</b> (FINISHED ${finished.length} / POSTPONED ${postponed.length} / RESCHEDULED ${rescheduled.length})\n\n` +
          `📍 <b>무엇</b>: TheSports(ts-) stale SCHEDULED/LIVE 매치 diary 검증\n` +
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
    rescheduled: rescheduled.length,
    kept: kept.length,
    skipped,
    rejectedPreviews,
  });
}
