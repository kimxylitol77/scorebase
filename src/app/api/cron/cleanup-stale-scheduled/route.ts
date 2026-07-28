// /api/cron/cleanup-stale-scheduled — 4시간 주기.
// 시작 시각 + STALE_HOURS 후까지 SCHEDULED 인 매치 → POSTPONED 자동 처리.
// source (ESPN/api-football/TheSports) 무관 — cleanup-ghost 가 cover 못하는 리그
// (USL_CH, JUPILER_PL, SINGAPORE_PL, NPB/KBO 등 비-ESPN) 까지 포괄.
//
// 처리 결과:
//   1) 텔레그램 알림 (5요소 + Haiku 진단)
//   2) HealthCheck row insert → /admin/health 페이지에 자동 노출

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { rejectPreviewsForPostponed } from "@/lib/reject-stale-previews";
import { API_FOOTBALL_LEAGUES } from "@/lib/sports";
import { afGoalsExcludingShootout } from "@/lib/sports/api-football-pro";
import {
  ESPN_BASKETBALL_SLUG,
  verifyEspnBasketball,
} from "@/lib/sports/espn-basketball-verify";
import { BASEBALL_LEAGUES, SOCCER_LEAGUES, MMA_LEAGUES } from "@/lib/sports/sport-leagues";
import type { League } from "@/lib/sports/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STALE_HOURS = 6;

// 연기 추종으로 startTime 을 옮길 때, 옮겨갈 시각에 이미 반대 소스의 같은 경기 row 가
// 있는지 확인하는 창. collect 의 dedup 가드와 같은 폭(축구 150분).
const TWIN_WINDOW_MS = 150 * 60 * 1000;

/**
 * 옮겨갈 시각 기준으로 "반대 소스의 같은 경기" row 를 찾는다.
 *
 * 왜 필요한가: collect 의 dedup 가드는 **row 생성 시점**에만 검사한다. 생성 당시엔 두
 * 소스의 킥오프가 달라 통과했다가, 나중에 한쪽이 연기 추종으로 옮겨오면 같은 시각에서
 * 충돌해 크로스소스 중복 2장이 된다 (2026-07-24 ICELAND_1L Fylkir vs IR Reykjavik —
 * af 가 7/23 19:15 → 7/25 14:00 으로 이동, 그 시각엔 이미 ts row 존재).
 */
async function findCrossSourceTwin(
  m: { id: number; league: string; externalId: string; homeTeamId: number; awayTeamId: number },
  newStart: Date,
) {
  const incomingTs = m.externalId.startsWith("ts-");
  return prisma.match.findFirst({
    where: {
      id: { not: m.id },
      league: m.league,
      startTime: {
        gte: new Date(newStart.getTime() - TWIN_WINDOW_MS),
        lte: new Date(newStart.getTime() + TWIN_WINDOW_MS),
      },
      // 같은 소스 안의 별개 경기를 짝으로 오인하지 않게 반대 prefix 로만 제한.
      ...(incomingTs
        ? { NOT: { externalId: { startsWith: "ts-" } } }
        : { externalId: { startsWith: "ts-" } }),
      OR: [
        { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId },
        { homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId },
      ],
    },
    select: {
      id: true,
      externalId: true,
      marketHome: true,
      marketDraw: true,
      marketAway: true,
      marketBookmakers: true,
    },
  });
}

/**
 * 흡수를 막지 않는 종속 테이블. 사람 판단이 필요한 종속(글·투표 등)과 달리 여기 있는 것은
 * "같은 경기"라는 사실만으로 기계적으로 처리할 수 있다.
 *
 * OddsSnapshot — 시장 배당 시계열. twin 이 이미 갖고 있으면 stale 쪽은 열등한 부분집합이라
 * 버려도 손실이 없고, 없으면 통째로 넘기면 된다. 이걸 차단 사유로 두면 흡수가 영영 안 되고
 * cron 이 2h 마다 같은 알림을 낸다 (2026-07-28 SUPERETTAN #309246: 스냅샷 2건이 흡수를 막아
 * 7/27 04시부터 12회 이상 동일 알림 반복. twin 은 같은 경기 배당을 이미 73건 보유).
 */
const ABSORB_IGNORED_TABLES = new Set(["OddsSnapshot"]);

/**
 * 중복이 확정된 stale row 를 쌍둥이로 흡수한다. 종속 데이터가 하나라도 있으면
 * 삭제하지 않고 false — cron 이 사람 판단 없이 파괴적으로 지우지 않게 한다
 * (data-sanity 의 크로스소스 중복 알림이 남아 사람이 처리).
 */
async function absorbIntoTwin(
  staleId: number,
  twin: NonNullable<Awaited<ReturnType<typeof findCrossSourceTwin>>>,
): Promise<boolean> {
  // matchId 를 참조하는 모든 테이블을 스키마에서 읽어 전수 확인 — 개별 모델을 나열하면
  // 테이블이 늘 때 조용히 새고, Cascade 관계는 에러 없이 함께 지워져 손실을 못 본다.
  const cols = await prisma.$queryRaw<Array<{ table_name: string; data_type: string }>>`
    SELECT c.table_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'matchId' AND t.table_type = 'BASE TABLE'`;
  for (const { table_name, data_type } of cols) {
    if (ABSORB_IGNORED_TABLES.has(table_name)) continue;
    const isText = data_type === "text" || data_type === "character varying";
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT COUNT(*)::int AS n FROM "${table_name}" WHERE "matchId" = $1`,
      isText ? String(staleId) : staleId,
    );
    if (rows[0]?.n) return false; // 종속 있음 — 사람이 판단
  }
  const stale = await prisma.match.findUnique({
    where: { id: staleId },
    select: { marketHome: true, marketDraw: true, marketAway: true, marketBookmakers: true },
  });
  await prisma.$transaction(async (tx) => {
    // 배당은 stale row 에만 있는 경우가 있어(af 가 odds 를 받아옴) 흡수 전 넘긴다.
    if (stale && twin.marketHome == null && stale.marketHome != null) {
      await tx.match.update({
        where: { id: twin.id },
        data: {
          marketHome: stale.marketHome,
          marketDraw: stale.marketDraw,
          marketAway: stale.marketAway,
          marketBookmakers: stale.marketBookmakers,
        },
      });
    }
    // 배당 시계열도 twin 이 비었을 때만 넘긴다. 양쪽에 있으면 섞지 않고 stale 쪽을
    // Cascade 로 버린다 — 두 소스의 평균이 한 차트에 겹치면 그래프가 지그재그가 된다.
    if ((await tx.oddsSnapshot.count({ where: { matchId: twin.id } })) === 0) {
      await tx.oddsSnapshot.updateMany({
        where: { matchId: staleId },
        data: { matchId: twin.id },
      });
    }
    await tx.match.delete({ where: { id: staleId } });
  });
  return true;
}

// 리그 → data source 매핑 (Haiku 진단 prompt 용 + 알림 hint)
// "api-football" 포함된 리그는 stale 처리 전 fixture status 외부 verify.
const SOURCE_HINT: Record<string, string> = {
  KBO: "api-baseball + TheSports",
  NPB: "api-baseball + TheSports",
  MLB: "ESPN + api-baseball",
  NBA: "BALLDONTLIE + ESPN verify",
  WNBA: "api-sports basketball(수집) + ESPN verify",
  NHL: "BALLDONTLIE",
  LOL: "BALLDONTLIE / Leaguepedia",
  EPL: "football-data + TheSports",
  LALIGA: "ESPN + TheSports",
  BUNDESLIGA: "ESPN + TheSports",
  BUNDESLIGA_2: "api-football + TheSports",
  SERIE_A: "ESPN + TheSports",
  LIGUE_1: "ESPN + TheSports",
  // 본선=ESPN 콜렉터, 예선=af backfill(externalId 가 af fixture id) — 혼합 소스.
  UCL: "ESPN(본선) + api-football(예선) + TheSports",
  UEL: "api-football + TheSports",
  MLS: "ESPN",
  K_LEAGUE: "api-football + TheSports",
  K_LEAGUE_1: "api-football + TheSports",
  K_LEAGUE_2: "api-football + TheSports",
  J_LEAGUE: "api-football + TheSports",
  J1_LEAGUE: "api-football + TheSports",
  URVALSDEILD: "api-football + TheSports",
  USA_USL_CH: "api-football",
  SINGAPORE_PL: "api-football",
  JUPILER_PL: "TheSports (Lightsail)",
};

// api-football fixture status short → 우리 Match.status + 매치 처리 분기
type VerifyAction =
  | { kind: "FINISHED"; homeScore: number | null; awayScore: number | null }
  | { kind: "LIVE"; homeScore: number | null; awayScore: number | null }
  | { kind: "POSTPONED" }
  | { kind: "SKIP" }; // status 알 수 없음 → 안전하게 기존 로직 (POSTPONED)

function classifyApiFootballStatus(
  short: string,
  goalsHome: number | null,
  goalsAway: number | null,
): VerifyAction {
  if (["FT", "AET", "PEN"].includes(short))
    return { kind: "FINISHED", homeScore: goalsHome, awayScore: goalsAway };
  if (["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(short))
    return { kind: "LIVE", homeScore: goalsHome, awayScore: goalsAway };
  if (["PST", "CANC", "ABD", "AWD", "WO", "SUSP", "INT"].includes(short))
    return { kind: "POSTPONED" };
  // NS / TBD / 알 수 없음 — fallback (POSTPONED)
  return { kind: "SKIP" };
}

// api-football /fixtures?ids 는 chunk size 최대 20.
// date 도 함께 반환 — 연기로 fixture.date 가 앞당겨/미뤄진 경우 startTime 을 추종 갱신하기 위함.
type AfFixtureVerify = {
  short: string;
  goalsHome: number | null;
  goalsAway: number | null;
  date: string | null;
};
async function fetchApiFootballStatuses(
  externalIds: string[],
): Promise<Map<string, AfFixtureVerify>> {
  const result = new Map<string, AfFixtureVerify>();
  const key = process.env.API_FOOTBALL_KEY;
  if (!key || externalIds.length === 0) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < externalIds.length; i += 20) chunks.push(externalIds.slice(i, i + 20));

  for (const chunk of chunks) {
    try {
      const res = await fetch(
        `https://v3.football.api-sports.io/fixtures?ids=${chunk.join("-")}`,
        {
          headers: { "x-apisports-key": key },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) continue;
      const data = (await res.json()) as {
        response?: Array<{
          fixture?: { id?: number; date?: string; status?: { short?: string } };
          goals?: { home?: number | null; away?: number | null };
          score?: {
            fulltime?: { home?: number | null; away?: number | null };
            extratime?: { home?: number | null; away?: number | null };
          };
        }>;
      };
      for (const f of data?.response ?? []) {
        const fid = f.fixture?.id != null ? String(f.fixture.id) : null;
        const short = f.fixture?.status?.short ?? "";
        if (!fid || !short) continue;
        const g = afGoalsExcludingShootout(short, f.goals, f.score);
        result.set(fid, {
          short,
          goalsHome: g.home,
          goalsAway: g.away,
          date: f.fixture?.date ?? null,
        });
      }
    } catch (e) {
      console.warn("[cleanup-stale-scheduled] api-football verify chunk fail:", (e as Error).message);
    }
  }
  return result;
}

async function diagnoseWithHaiku(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data?.content?.[0]?.text?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Vercel cron secret auth (CRON_SECRET) 또는 INTERNAL_API_TOKEN
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STALE_HOURS * 3600 * 1000);

  // 1) stale LIVE 매치 처리 (시작 + cutoff 지났는데 LIVE) — data-sanity 봇 알림 제거
  //    점수 있으면 FINISHED, 없으면 POSTPONED.
  //    축구는 3.5h (종료 ~2.5h 후 여유) — ts 군소 축구가 fast-poller 누락으로 LIVE 고착하는
  //    공백 단축(2026-06-14 ARG #441867 진단). 야구/기타는 연장 고려 6h 유지. 정밀 복구는
  //    mac-mini stale-ts-verify(diary status_id)가 먼저 처리하고, 이 cron 은 worker 중단 시 백스톱.
  const liveCutoffSoccer = new Date(Date.now() - 3.5 * 3600 * 1000);
  const liveCutoffDefault = new Date(Date.now() - 6 * 3600 * 1000);
  // 친선(CLUB_FRIENDLY)은 종료 후 TheSports diary/recent 에서 빠르게 사라져 stale-ts-verify
  // 의 diary status_id verify 가 못 잡고 KEPT 로 쌓임 → 이 시간 백스톱만 실효. 연장·승부차기
  // 포함 최대 2.5h 면 확실히 종료라 3.5h(연장 컵대회 여유) 대신 2.5h 로 당겨 유령 LIVE 노출·
  // data-sanity 반복 알림 공백 단축 (2026-07-11 #1159143/#1159129 207분 stuck 진단).
  const liveCutoffFriendly = new Date(Date.now() - 2.5 * 3600 * 1000);
  const staleLive = await prisma.match.findMany({
    where: {
      status: "LIVE",
      OR: [
        { league: "CLUB_FRIENDLY", startTime: { lt: liveCutoffFriendly } },
        { league: { in: [...SOCCER_LEAGUES] }, startTime: { lt: liveCutoffSoccer } },
        { league: { notIn: [...SOCCER_LEAGUES] }, startTime: { lt: liveCutoffDefault } },
      ],
    },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  let liveFinished = 0;
  let livePostponed = 0;
  const livePostponedIds: number[] = [];
  for (const m of staleLive) {
    const hasScore = m.homeScore != null && m.awayScore != null;
    const newStatus: "FINISHED" | "POSTPONED" = hasScore ? "FINISHED" : "POSTPONED";
    await prisma.match.update({ where: { id: m.id }, data: { status: newStatus } });
    if (newStatus === "FINISHED") liveFinished++; else { livePostponed++; livePostponedIds.push(m.id); }
  }
  // 무경기로 POSTPONED 된 매치의 PUBLISHED PREVIEW 글을 REJECTED 로 내림 (사이트 노출 차단).
  let rejectedPreviews = await rejectPreviewsForPostponed(livePostponedIds);

  // 1b) future_live 매치 자동 롤백 — startTime 이 미래 (now + 1h+) 인데 status=LIVE.
  // 2026-05-27 NPB #328161 (5/31 시작) 발견. TheSports status_id=0/1 LIVE 잘못 매핑 잔재.
  // status=SCHEDULED + score null 로 즉시 강제 복원 (data-sanity future_live 알림 자동 해소).
  // MMA/UFC 제외 — 파이트 카드 개별 경기 startTime 은 추정치라 추정보다 먼저 LIVE 가 정상.
  // 롤백하면 진짜 진행 중인 경기를 SCHEDULED 로 되돌려 라이브 노출이 사라짐 (2026-06-21 UFC).
  const futureLiveCutoff = new Date(Date.now() + 60 * 60 * 1000);
  const futureLive = await prisma.match.findMany({
    where: { status: "LIVE", startTime: { gt: futureLiveCutoff }, league: { notIn: [...MMA_LEAGUES] } },
    select: { id: true, league: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
  });
  let futureLiveRolledBack = 0;
  if (futureLive.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: futureLive.map((m) => m.id) } },
      data: { status: "SCHEDULED", homeScore: null, awayScore: null },
    });
    futureLiveRolledBack = futureLive.length;
  }

  // 2) stale SCHEDULED 매치 처리
  //    api-football cover 리그는 fixture status 외부 verify → 잘못된 POSTPONED 차단.
  const stale = await prisma.match.findMany({
    where: { status: "SCHEDULED", startTime: { lt: cutoff } },
    include: { homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    orderBy: { startTime: "asc" },
  });

  // api-football 으로 verify 할 매치 — collectors 에서 source="api-football" 로 태그된 리그만.
  // (SOURCE_HINT 화이트리스트는 누락 리그 — MOLDOVA_SL/COPA_LIB/ICELAND_1L 등 — 가 영구 stuck 됐음.
  //  ESPN/TheSports id 리그는 제외해 fixture id 오조회 방지. 숫자 ext 가드는 belt-and-suspenders.)
  //
  // UCL 예외(2026-07-16): 콜렉터가 ESPN 이라 위 집합에서 빠지지만, **예선(Q1~PO) fixture 는
  // 일정 backfill(af)이 심어 externalId 가 af fixture id** 다. ESPN 은 예선을 다른 slug
  // (uefa.champions_qual)로 서비스해 우리 콜렉터가 0건 → af 가 FT+점수를 갖고 있는데도 verify
  // 대상이 아니라 40h 넘게 stale SCHEDULED 로 남았음. verify 자격을 "콜렉터 소스"가 아니라
  // "externalId 가 af id 냐"로 봐야 맞는 케이스. 단 UCL 본선 row 는 ESPN event id(4억대)라
  // af 에 없어 조회되지 않고(=KEPT 유지), 만에 하나 조회되더라도 아래 날짜 대조로 차단한다.
  const AF_VERIFY_EXTRA_LEAGUES = new Set<string>(["UCL"]);
  const isAfVerifiable = (lg: string) =>
    API_FOOTBALL_LEAGUES.has(lg as League) || AF_VERIFY_EXTRA_LEAGUES.has(lg);
  const verifyTargets = stale.filter(
    (m) => isAfVerifiable(m.league) && /^\d+$/.test(m.externalId),
  );
  const verifyMap = await fetchApiFootballStatuses(verifyTargets.map((m) => m.externalId));

  // ESPN 농구 verify — WNBA 는 api-sports 농구 quota 로 verify 커버가 제거돼 항상 unknown
  // → 영구 KEPT + 매 run 같은 알림 반복 (2026-07-17 WNBA #242294 Dallas-NY POSTPONED 수동 처리).
  // ESPN scoreboard 로 STATUS_FINAL/STATUS_POSTPONED 만 확정 처리, 그 외는 기존대로 KEPT.
  const espnBasketballVerdicts = await verifyEspnBasketball(
    stale
      .filter((m) => ESPN_BASKETBALL_SLUG[m.league])
      .map((m) => ({
        id: m.id,
        league: m.league,
        startTime: m.startTime,
        homeName: m.homeTeam.name,
        awayName: m.awayTeam.name,
      })),
  );

  // 오조회 가드 — 추가 리그(콜렉터 소스가 af 가 아닌 리그)는 id 가 af 것이 아닐 수 있으므로
  // af fixture 의 date 가 우리 startTime 과 근접(±72h, 연기 추종 여지)할 때만 신뢰한다.
  // 기존 af 콜렉터 리그는 id 확실 → 검사 없음(동작 불변).
  const AF_DATE_TOLERANCE_MS = 72 * 3600 * 1000;
  for (const m of verifyTargets) {
    if (API_FOOTBALL_LEAGUES.has(m.league as League)) continue; // 기존 리그는 그대로
    const v = verifyMap.get(m.externalId);
    if (!v) continue;
    const afMs = v.date ? new Date(v.date).getTime() : NaN;
    if (!Number.isFinite(afMs) || Math.abs(afMs - m.startTime.getTime()) > AF_DATE_TOLERANCE_MS) {
      console.warn(
        `[cleanup-stale-scheduled] af 오조회 의심 — ${m.league} #${m.id} ext=${m.externalId} afDate=${v.date} ourStart=${m.startTime.toISOString()} → verify 미적용`,
      );
      verifyMap.delete(m.externalId);
    }
  }

  // 분류 결과
  const verifiedFinished: typeof stale = [];
  const verifiedLive: typeof stale = [];
  const verifyKept: typeof stale = []; // NS/TBD 등 — 그대로 SCHEDULED 유지
  const rescheduled: typeof stale = []; // NS 인데 af date 가 미래로 갱신됨 → startTime 추종
  const dupAbsorbed: typeof stale = []; // 연기 추종 대상이 반대 소스 row 와 겹쳐 흡수(삭제)됨
  const dupConflict: typeof stale = []; // 겹쳤지만 종속 데이터가 있어 사람 판단 대기
  const toPostpone: typeof stale = [];

  for (const m of stale) {
    // ESPN 농구 verdict — match id 키라 af fixture id 와 충돌 없음. WNBA/NBA 는 af verify
    // 대상이 아니라 최우선 분기해도 기존 경로와 겹치지 않는다. verdict 없으면 아래 KEPT.
    const eb = espnBasketballVerdicts.get(m.id);
    if (eb) {
      if (eb.kind === "FINISHED") {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "FINISHED",
            homeScore: eb.homeScore ?? undefined,
            awayScore: eb.awayScore ?? undefined,
          },
        });
        verifiedFinished.push(m);
        continue;
      }
      toPostpone.push(m);
      continue;
    }
    const v = verifyMap.get(m.externalId);
    if (v) {
      const action = classifyApiFootballStatus(v.short, v.goalsHome, v.goalsAway);
      if (action.kind === "FINISHED") {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "FINISHED",
            homeScore: action.homeScore ?? undefined,
            awayScore: action.awayScore ?? undefined,
          },
        });
        verifiedFinished.push(m);
        continue;
      }
      if (action.kind === "LIVE") {
        await prisma.match.update({
          where: { id: m.id },
          data: {
            status: "LIVE",
            homeScore: action.homeScore ?? undefined,
            awayScore: action.awayScore ?? undefined,
          },
        });
        verifiedLive.push(m);
        continue;
      }
      if (action.kind === "POSTPONED") {
        toPostpone.push(m);
        continue;
      }
      // SKIP — NS/TBD 등. af 가 여전히 미시작이라 확정 상태 전이는 없지만,
      // fixture.date 가 연기로 미래로 밀렸는데 collector day-loop 창(+7d) 밖이라
      // startTime 이 과거에 동결된 케이스 → af date 를 추종 갱신해 stale 루프 해소.
      // (2026-07-14 ECUADOR_LP/BOLIVIA_PD 진단: 옛 날짜가 창 밖으로 빠져 매 4h 오탐 반복.)
      // 미래(now 이후) + 기존 startTime 과 60초+ 차이일 때만 — 동일값 무의미 update 회피.
      const afDate = v.date ? new Date(v.date) : null;
      if (
        afDate &&
        !Number.isNaN(afDate.getTime()) &&
        afDate.getTime() > Date.now() &&
        Math.abs(afDate.getTime() - m.startTime.getTime()) > 60_000
      ) {
        // 옮겨갈 시각에 반대 소스의 같은 경기가 이미 있으면, 갱신은 곧 크로스소스 중복이다.
        // 그대로 옮기지 않고 흡수(종속 없을 때만) — 실패하면 startTime 을 건드리지 않아
        // 최소한 두 row 가 같은 시각에 겹치는 상태는 만들지 않는다.
        const twin = await findCrossSourceTwin(m, afDate);
        if (twin) {
          const absorbed = await absorbIntoTwin(m.id, twin);
          (absorbed ? dupAbsorbed : dupConflict).push(m);
          continue;
        }
        await prisma.match.update({
          where: { id: m.id },
          data: { startTime: afDate },
        });
        rescheduled.push(m);
        continue;
      }
      // 상태 변경하지 않고 SCHEDULED 유지 (다음 cron 에서 재시도)
      verifyKept.push(m);
      continue;
    }
    // 야구 리그 — api-football verify 불가. collector 가 score 는 넣었지만 status sync
    // 를 누락한 케이스 보강 (2026-05-28 #2218 KBO 5/26 종료인데 SCHEDULED 50h 방치).
    // 야구는 시작 +6h 면 무조건 종료/연기 → 점수가 들어와 있으면 FINISHED 로 정정.
    // 점수가 없으면 우천연기/미시작 가능성 → keep (destructive 회피, 안전).
    //   ※ ts- 야구 매치(NPB/LMB 등)는 mac-mini worker(stale-ts-verify)가 baseball diary 로
    //     status_id 까지 확인해 POSTPONED 확정 — Vercel 은 IP 화이트리스트로 TheSports 호출 불가.
    if (BASEBALL_LEAGUES.has(m.league as League)) {
      if (m.homeScore != null && m.awayScore != null) {
        await prisma.match.update({
          where: { id: m.id },
          data: { status: "FINISHED" },
        });
        verifiedFinished.push(m);
        continue;
      }
      verifyKept.push(m);
      continue;
    }
    // verify 응답 없음 — 외부 status 확인 실패. 임의 POSTPONED 금지, SCHEDULED 유지.
    // 2026-05-27 LMB/BUNDESLIGA_2/URVALSDEILD 일괄 false positive 재발 방지.
    // SOURCE_HINT 미등록 리그 (NBA/NHL 등) 도 동일하게 keep — destructive 봇은
    // 외부 verify 가 가능한 리그에만 POSTPONED 처리.
    //   ※ ts- (TheSports) 축구 매치(CANADA_PL/CHILE_PB 등)는 여기서 KEPT 로 두되,
    //     mac-mini worker(stale-ts-verify)가 football diary 로 별도 verify → FINISHED/POSTPONED.
    verifyKept.push(m);
  }

  if (stale.length === 0 && staleLive.length === 0) {
    // OK row 도 남김 — /admin/health 에서 "정상 동작 중" 확인 가능
    await prisma.healthCheck.create({
      data: {
        severity: "OK",
        category: "stale-cleanup",
        key: "summary",
        message: "stale SCHEDULED/LIVE 매치 없음 — 모든 cron 정상",
        metadata: { marked: 0, staleHours: STALE_HOURS },
      },
    });
    return NextResponse.json({ ok: true, marked: 0, liveFinished: 0, livePostponed: 0 });
  }
  if (stale.length === 0) {
    // LIVE 만 정리된 케이스 — telegram 알림 + 조용히 종료
    await prisma.healthCheck.create({
      data: {
        severity: liveFinished + livePostponed >= 5 ? "MED" : "LOW",
        category: "stale-cleanup",
        key: "live-summary",
        message: `stale LIVE ${staleLive.length}건 정리 (FINISHED ${liveFinished} / POSTPONED ${livePostponed})`,
        // sample 은 메인 경로(아래 summary)와 동일 스키마 유지 — /admin/health 가 startTime 으로 렌더
        metadata: { liveFinished, livePostponed, rejectedPreviews, sample: staleLive.slice(0, 5).map(m => ({ id: m.id, league: m.league, source: SOURCE_HINT[m.league] ?? "unknown", teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`, startTime: m.startTime.toISOString() })) },
      },
    });
    return NextResponse.json({ ok: true, marked: 0, liveFinished, livePostponed, rejectedPreviews });
  }

  if (toPostpone.length > 0) {
    await prisma.match.updateMany({
      where: { id: { in: toPostpone.map((m) => m.id) } },
      data: { status: "POSTPONED" },
    });
    rejectedPreviews += await rejectPreviewsForPostponed(toPostpone.map((m) => m.id));
  }

  // 리그별 카운트 (POSTPONED 처리된 매치만) + sample + source hint
  const byLeague: Record<string, number> = {};
  for (const m of toPostpone) byLeague[m.league] = (byLeague[m.league] ?? 0) + 1;
  const leagueLines = Object.entries(byLeague)
    .sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `  ${l}: ${n}건 (source: ${SOURCE_HINT[l] ?? "unknown"})`)
    .join("\n");
  const sampleLines = toPostpone
    .slice(0, 8)
    .map(
      (m) =>
        `  ${m.startTime.toISOString().slice(5, 16)} | ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name}`,
    )
    .join("\n");

  // verify 로 정정된 매치 sample (false positive 차단 실적)
  const correctedLines = [...verifiedFinished, ...verifiedLive]
    .slice(0, 8)
    .map((m) => {
      const v = verifyMap.get(m.externalId);
      const tag = verifiedFinished.includes(m) ? "FT" : "LIVE";
      const src = espnBasketballVerdicts.has(m.id)
        ? `ESPN ${espnBasketballVerdicts.get(m.id)?.typeName ?? "?"}`
        : BASEBALL_LEAGUES.has(m.league as League)
          ? "TheSports score"
          : `api-football ${v?.short ?? "?"}`;
      return `  [${tag}] ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} (${src})`;
    })
    .join("\n");

  // RESCHEDULED (af date 추종으로 startTime 미래 갱신) sample — 오탐 자가치유 실적.
  const rescheduledLines = rescheduled
    .slice(0, 8)
    .map((m) => {
      const v = verifyMap.get(m.externalId);
      const to = v?.date ? new Date(v.date).toISOString().slice(5, 16) : "?";
      return `  ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} → ${to}`;
    })
    .join("\n");

  // KEPT (상태 변경 없이 SCHEDULED 유지) sample. verify 불가 리그(ESPN/TheSports/esports)
  // 거나 외부 status 가 NS/TBD 라 안전하게 둔 매치. 같은 매치가 매 run 반복되면
  // = 영구 stuck → source/collector 점검 필요하므로 알림에 실제 목록을 노출한다.
  const keptLines = verifyKept
    .slice(0, 8)
    .map((m) => {
      const hrs = Math.round((Date.now() - m.startTime.getTime()) / 3600000);
      return `  ${m.league} | ${m.awayTeam.name} vs ${m.homeTeam.name} (${hrs}h, ${SOURCE_HINT[m.league] ?? "unknown"})`;
    })
    .join("\n");

  // Haiku 진단 — POSTPONED 처리된 매치가 있을 때만.
  // KEPT-only (전부 api-football verify 로 SCHEDULED 유지) 면 진단 프롬프트의
  // 리그별 카운트/샘플이 toPostpone 기반이라 빈 문자열 → Haiku 가 "데이터 없음" 응답.
  let diagnosis: string | null = null;
  if (toPostpone.length > 0) {
    const diagnosePrompt =
      `다음은 scorebase 의 stale 매치 자동 정리 보고서입니다.\n` +
      `시작 시각 + ${STALE_HOURS}시간 지났는데 SCHEDULED 상태로 남은 매치들 (= cron 업데이트 누락).\n\n` +
      `리그별 카운트:\n${leagueLines}\n\n` +
      `샘플:\n${sampleLines}\n\n` +
      `요청:\n` +
      `1) 각 리그별 가장 가능성 높은 원인 1개 (cron 누락 / source API 변화 / collector 미지원 / 오프시즌 / 비공식 매치 등)\n` +
      `2) 즉시 확인할 곳 (예: "vercel logs --grep collect", "Lightsail systemd logs")\n` +
      `3) 정상 (오프시즌 등) 인 경우 명시\n\n` +
      `형식: 리그명별 1줄 (한국어). 마지막 줄에 종합 권장 action 1개.`;
    diagnosis = await diagnoseWithHaiku(diagnosePrompt);
  }

  // HealthCheck row insert — /admin/health 에 자동 노출
  const correctedCount = verifiedFinished.length + verifiedLive.length;
  const severity =
    toPostpone.length >= 10 ? "HIGH" : toPostpone.length >= 3 ? "MED" : correctedCount > 0 ? "LOW" : "LOW";
  await prisma.healthCheck.create({
    data: {
      severity,
      category: "stale-cleanup",
      key: "summary",
      message:
        `stale SCHEDULED ${stale.length}건 — POSTPONED ${toPostpone.length}, ` +
        `FINISHED ${verifiedFinished.length}, LIVE ${verifiedLive.length}, ` +
        `RESCHEDULED ${rescheduled.length}, KEPT ${verifyKept.length}` +
        (dupAbsorbed.length || dupConflict.length
          ? `, 중복흡수 ${dupAbsorbed.length}, 중복충돌 ${dupConflict.length}`
          : ""),
      metadata: {
        staleHours: STALE_HOURS,
        totalStale: stale.length,
        postponed: toPostpone.length,
        verifiedFinished: verifiedFinished.length,
        verifiedLive: verifiedLive.length,
        rescheduled: rescheduled.length,
        verifyKept: verifyKept.length,
        dupAbsorbed: dupAbsorbed.length,
        dupConflict: dupConflict.length,
        byLeague,
        sample: toPostpone.slice(0, 10).map((m) => ({
          id: m.id,
          league: m.league,
          source: SOURCE_HINT[m.league] ?? "unknown",
          teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
          startTime: m.startTime.toISOString(),
        })),
        correctedSample: [...verifiedFinished, ...verifiedLive].slice(0, 10).map((m) => {
          const v = verifyMap.get(m.externalId);
          return {
            id: m.id,
            league: m.league,
            teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
            apiFootballShort: v?.short ?? null,
            goalsHome: v?.goalsHome ?? null,
            goalsAway: v?.goalsAway ?? null,
          };
        }),
        diagnosis: diagnosis ?? null,
      },
    },
  });

  // 텔레그램 알림 — 진단 포함
  try {
    const summary =
      `POSTPONED ${toPostpone.length} / FINISHED ${verifiedFinished.length} / LIVE ${verifiedLive.length}` +
      (rescheduled.length > 0 ? ` / RESCHEDULED ${rescheduled.length}` : "") +
      (verifyKept.length > 0 ? ` / KEPT ${verifyKept.length}` : "");
    await sendTelegram(
      `🧹 <b>stale SCHEDULED ${stale.length}건 처리</b> (${summary})\n\n` +
        `📍 <b>무엇</b>: 시작 + ${STALE_HOURS}h+ 지났는데 SCHEDULED 상태\n` +
        `💥 <b>영향</b>: /scores 페이지 잘못 노출 차단 + api-football verify 로 false positive 제거\n` +
        `🔍 <b>원인</b>: cron 미업데이트 (collector 누락 / source API 변화)\n\n` +
        (toPostpone.length > 0
          ? `<b>POSTPONED 리그별</b>:\n<code>${leagueLines}</code>\n\n<b>sample</b>:\n<code>${sampleLines}</code>\n\n`
          : "") +
        (correctedCount > 0
          ? `<b>verify 로 정정 (${correctedCount}건)</b>:\n<code>${correctedLines}</code>\n\n`
          : "") +
        (rescheduled.length > 0
          ? `<b>연기 추종 — startTime 갱신 (${rescheduled.length}건)</b>:\n<code>${rescheduledLines}</code>\n\n`
          : "") +
        // KEPT 매치 실제 목록. 과거엔 toPostpone===0 이면 "모두 정정됨" 을 무조건 출력해
        // 정정 0·KEPT 다수인 run 에서 거짓 안심을 줬다 → 유지된 매치를 그대로 보여준다.
        (verifyKept.length > 0
          ? `<b>SCHEDULED 유지 (${verifyKept.length}건 — verify 불가/미정, stuck 가능)</b>:\n<code>${keptLines}</code>\n\n`
          : "") +
        (toPostpone.length > 0
          ? diagnosis
            ? `🤖 <b>Haiku 진단</b>:\n${diagnosis}\n\n`
            : `<i>(ANTHROPIC_API_KEY 미설정 — Vercel env 등록 시 AI 진단 활성)</i>\n\n`
          : "") +
        `➡️ <b>확인</b>: scorebase.kr/admin/health (category=stale-cleanup)\n\n` +
        `<code>[안내] cron-cleanup-stale-scheduled</code>`,
    );
  } catch (e) {
    console.warn("[cleanup-stale-scheduled] telegram fail:", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    totalStale: stale.length,
    postponed: toPostpone.length,
    verifiedFinished: verifiedFinished.length,
    verifiedLive: verifiedLive.length,
    rescheduled: rescheduled.length,
    verifyKept: verifyKept.length,
    rejectedPreviews,
    byLeague,
    diagnosis,
    sample: toPostpone.slice(0, 5).map((m) => ({
      id: m.id,
      league: m.league,
      teams: `${m.awayTeam.name} vs ${m.homeTeam.name}`,
      startTime: m.startTime.toISOString(),
    })),
  });
}
