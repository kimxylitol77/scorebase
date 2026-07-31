// /api/cron/standings-collect — 일 1회.
// api-football /standings 로 순위를 fetch + ApiFootballStandingsCache 저장.
// 매핑 dictionary 없이 Team.externalId 로 매칭 — TheSports mapping 누락 회피.
//
// ⚠ TheSports = 데이터 1순위 원칙 (사용자 확정, 2026-06-10 / 07-07 재확인).
//   af 는 "TheSports 에 진짜 순위표가 없을 때"만 쓰는 fallback 이다.
//   특히 **팀 매핑률이 낮은 리그는 af 로 메우지 않는다** — 그건 ts 팀매핑을 추가해 푸는 문제다
//   (예: BELARUS_PL stat-bridge). 매핑률 미달은 여기서 수집 대상이 아니라 감시 예외로 보고한다.
//
// 2026-07-31 개편 — "TheSports 에 지금 쓸 수 있는 표가 없는 리그만" 보강한다.
//   이전: tsSeasonId 가 있는 리그는 무조건 af 수집에서 제외(TS_STANDINGS_COVERED).
//         그래서 ts 캐시가 지난 시즌 uuid 로 동결돼도(UCL·분데스리가 72일) af 가 못 메웠다.
//   지금: ts 캐시가 없거나 / ACTIVE 시즌과 어긋나거나 / 24h+ 갱신이 끊긴 리그만 부른다.
//         quota 보호를 위해 "최근·향후 일정이 있는 리그"로 한 번 더 좁힌다 — 비수기 리그는 안 부른다.
//
// 시즌 연도는 CompetitionSeason(ACTIVE) 우선, 없으면 season-calendar 계산(fallback).

import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { Prisma } from "@prisma/client";
import { recordCronRun } from "@/lib/cron-registry";
import { prisma } from "@/lib/db";
import { API_FOOTBALL_LEAGUE_ID } from "@/lib/sports/api-football-pro";
import { SOCCER_LEAGUES } from "@/lib/sports/types";
import { NO_STANDINGS_LEAGUES } from "@/lib/sports/season-calendar";
import { PROVIDER_TS, getActiveSeason, resolveSeasonYear } from "@/lib/sports/season-registry";
import { tsCacheUsable } from "@/lib/sports/thesports/standings-gate";
import { GROUPED_STANDINGS_LEAGUES } from "@/lib/sports/thesports/standings-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AF_BASE = "https://v3.football.api-sports.io";

/** ts 캐시가 이보다 오래되면 "신선하지 않다" — poller 는 10분 주기라 24h 는 충분히 관대하다. */
const TS_STALE_MS = 24 * 3600 * 1000;
/** 일정 창 — 이 안에 경기가 있는 리그만 af 를 부른다 (quota 보호). */
const FIXTURE_WINDOW_PAST_MS = 7 * 86400_000;
const FIXTURE_WINDOW_FUTURE_MS = 45 * 86400_000;

interface AfStandingsResp {
  response?: Array<{
    league?: {
      standings?: Array<
        Array<{
          rank: number;
          team: { id: number; name: string };
          points: number;
          all?: { played?: number; win?: number; draw?: number; lose?: number };
          group?: string;
        }>
      >;
    };
  }>;
}

interface RowOut {
  teamExternalId: string;
  position: number;
  points: number;
  won: number;
  draw: number;
  loss: number;
  group?: string;
}

async function fetchStandings(
  apiKey: string,
  leagueId: number,
  season: number,
): Promise<RowOut[] | null> {
  try {
    const res = await fetch(
      `${AF_BASE}/standings?league=${leagueId}&season=${season}`,
      {
        headers: { "x-apisports-key": apiKey },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as AfStandingsResp;
    const standings = data.response?.[0]?.league?.standings;
    if (!standings || standings.length === 0) return null;
    const out: RowOut[] = [];
    for (const table of standings) {
      for (const r of table) {
        out.push({
          teamExternalId: String(r.team.id),
          position: r.rank,
          points: r.points,
          won: r.all?.win ?? 0,
          draw: r.all?.draw ?? 0,
          loss: r.all?.lose ?? 0,
          group: r.group,
        });
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API_FOOTBALL_KEY missing" }, { status: 500 });
  }

  const now = new Date();

  // 1) 최근·향후 일정이 있는 리그 — af 호출 대상을 여기로 한정한다(quota 보호).
  const fixtureLeagues = new Set(
    (
      await prisma.match.groupBy({
        by: ["league"],
        where: {
          startTime: {
            gte: new Date(now.getTime() - FIXTURE_WINDOW_PAST_MS),
            lte: new Date(now.getTime() + FIXTURE_WINDOW_FUTURE_MS),
          },
        },
        _count: { _all: true },
      })
    ).map((r) => r.league),
  );

  // 2) ts 순위 캐시 상태 — 리그별로 "af 보강이 필요한가"를 판정한다.
  const tsCaches = await prisma.theSportsStandingsCache.findMany({
    select: { league: true, tsSeasonId: true, fetchedAt: true, payload: true },
  });
  const tsByLeague = new Map(tsCaches.map((c) => [c.league, c]));

  const out: {
    ok: number;
    skip: number;
    fail: string[];
    reasons: Record<string, number>;
  } = { ok: 0, skip: 0, fail: [], reasons: {} };

  const targets: Array<{ league: string; reason: string }> = [];
  for (const league of SOCCER_LEAGUES as readonly string[]) {
    if (!API_FOOTBALL_LEAGUE_ID[league as keyof typeof API_FOOTBALL_LEAGUE_ID]) continue;
    if (NO_STANDINGS_LEAGUES.has(league)) continue; // 친선 — 순위표 자체가 없다
    if (!fixtureLeagues.has(league)) {
      out.skip++;
      continue;
    }

    const cache = tsByLeague.get(league);
    let reason: string | null = null;
    // J1/J2 는 ts stage_id 가 opaque 라 그룹(East/West) 분리가 안 돼서 getFullStandings 가
    // af 를 **주 소스**로 쓴다. 따라서 ts 캐시가 아무리 신선해도 af 를 계속 갱신해야 한다.
    // (d55ef03: J1 af 캐시가 66일 동결돼 19경기 누락된 사고 — 이 조건 빠지면 재발한다.)
    if (GROUPED_STANDINGS_LEAGUES.has(league)) {
      reason = "af-primary";
    } else if (!cache) {
      reason = "ts-cache-none";
    } else {
      const active = await getActiveSeason(league, PROVIDER_TS);
      const gate = tsCacheUsable(league, active?.providerSeasonId ?? null, cache.tsSeasonId);
      const ageMs = now.getTime() - cache.fetchedAt.getTime();
      if (!gate.usable) reason = "ts-season-mismatch";
      else if (ageMs > TS_STALE_MS) reason = "ts-stale";
      // ⚠ 매핑률 미달은 여기 없다 — af 로 메우면 TheSports 1순위 원칙을 깬다.
      //   해결은 ts 팀매핑 추가이고, 그 알림은 football-season-watch 가 낸다.
    }
    if (!reason) {
      out.skip++;
      continue;
    }
    targets.push({ league, reason });
    out.reasons[reason] = (out.reasons[reason] ?? 0) + 1;
  }

  // 3) 우선순위 + 상한 — maxDuration 60s 안에 못 끝낼 만큼 대상이 많아질 수 있다.
  //    급한 순서(af 주소스 > 시즌 불일치 > 캐시 없음 > stale)로 자르고, 잘린 수는 응답에 남긴다
  //    (조용한 truncation 은 "다 돌았다"로 오독되므로 반드시 보고한다).
  const PRIORITY: Record<string, number> = {
    "af-primary": 0, // J1/J2 — af 가 주 소스라 밀리면 표가 통째로 멈춘다
    "ts-season-mismatch": 1,
    "ts-cache-none": 2,
    "ts-stale": 3,
  };
  const afAges = new Map(
    (
      await prisma.apiFootballStandingsCache.findMany({ select: { league: true, fetchedAt: true } })
    ).map((r) => [r.league, r.fetchedAt.getTime()]),
  );
  targets.sort(
    (a, b) =>
      (PRIORITY[a.reason] ?? 9) - (PRIORITY[b.reason] ?? 9) ||
      (afAges.get(a.league) ?? 0) - (afAges.get(b.league) ?? 0),
  );
  const MAX_PER_RUN = 45;
  const deferred = Math.max(0, targets.length - MAX_PER_RUN);
  const batch = targets.slice(0, MAX_PER_RUN);

  for (const { league } of batch) {
    const leagueId = API_FOOTBALL_LEAGUE_ID[league as keyof typeof API_FOOTBALL_LEAGUE_ID]!;
    // 시즌 연도 — ACTIVE 레지스트리 우선, 없으면 달력 계산.
    const season = await resolveSeasonYear(league, now);
    const rows = await fetchStandings(apiKey, leagueId, season);
    if (!rows || rows.length === 0) {
      out.fail.push(`${league}(s${season})`);
      continue;
    }
    await prisma.apiFootballStandingsCache.upsert({
      where: { league },
      create: { league, season, rows: rows as unknown as Prisma.InputJsonValue },
      update: { season, rows: rows as unknown as Prisma.InputJsonValue, fetchedAt: new Date() },
    });
    out.ok++;
    await new Promise((r) => setTimeout(r, 200));
  }

  await recordCronRun("standings-collect", { count: out.ok });
  return NextResponse.json({
    success: true,
    targeted: targets.length,
    processed: batch.length,
    deferred, // 이번 회차에 못 돈 리그 수 — 다음 회차에서 우선순위대로 재시도된다
    ...out,
  });
}
