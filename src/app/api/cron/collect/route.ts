import { NextResponse } from "next/server";
import { isCronAuthorized as authorized } from "@/lib/cron-auth";
import { runCollect } from "@/jobs/collect";
import type { League } from "@/lib/sports/types";
import { TS_COVERED_EXCEPTIONS } from "@/lib/sports/ts-covered-exceptions";
import { tsInactiveLeagues } from "@/lib/sports/ts-coverage-fallback";
import { ALL_LEAGUES } from "@/lib/sports/collect-leagues";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Phase 3c (2026-05-25): TheSports football collector 가 cover 하는 축구 리그는
// api-football collect 에서 skip. ts collector 가 매치 row 만들고 endpoint dedup
// 가드가 ts: prefix 매치 중복 차단. api-football quota 70%+ 절약.
//
// 미커버 16 (api-football collector 계속 사용): EFL_CUP, SUI_CUP, UEFA_NL,
// INTL_FRIENDLY, EURO_QUAL, BELARUS_PL, K3/K4_LEAGUE, PARAGUAY_PD, VIETNAM_VL2,
// A_LEAGUE_W, OLYMPICS_FOOTBALL, KFA_CUP(id 294 활성화 2026-05-25), BRASILEIRAO_2 등.
//
// 야구/농구/하키 등 비-축구 리그는 TS_COVERED 에 없으므로 filter 통과 — 영향 X.
const TS_COVERED = new Set(
  (tsLeagueMap as Array<{ code: string; tsSeasonId?: string }>)
    .filter((e) => e.tsSeasonId)
    .map((e) => e.code),
);
// TS_COVERED_EXCEPTIONS 는 공용 모듈로 이동 — 등재 사유·이력 주석도 그쪽 참조.

// ALL_LEAGUES 는 src/lib/sports/collect-leagues.ts 로 이동(일정 공백 감시와 공용, 2026-10-03).

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // ?leagues=K_LEAGUE_1,J1_LEAGUE,... — 부분 수집 (Vercel Hobby 60초 한도 회피용 batch).
  // ?pastDays=N&futureDays=N — 일자 범위 조정 (수동 backfill 용).
  const url = new URL(req.url);
  const leaguesParam = url.searchParams.get("leagues");
  const pastDaysParam = url.searchParams.get("pastDays");
  const futureDaysParam = url.searchParams.get("futureDays");
  const leaguesRaw = leaguesParam
    ? (leaguesParam.split(",").filter(Boolean) as League[])
    : ALL_LEAGUES;
  // Phase 3c — TS cover 축구 리그 skip (야구/농구/하키는 영향 없음).
  // 단 TS_COVERED_EXCEPTIONS 는 ts collector 실커버리지가 없어 af 수집 유지.
  // + TS_COVERED 인데 ts 가 실제로 경기를 안 가져오는 리그는 자동으로 af 수집에 되돌린다(2026-10-03, ts-coverage-fallback).
  //   예외 목록을 손으로 늘리던 일(ISL·UAE·HNL…)을 매 실행 실적 판정으로 대신한다.
  const skipped = leaguesRaw.filter((l) => TS_COVERED.has(l) && !TS_COVERED_EXCEPTIONS.has(l));
  const fallback = await tsInactiveLeagues(skipped);
  const leagues = [...leaguesRaw.filter((l) => !TS_COVERED.has(l) || TS_COVERED_EXCEPTIONS.has(l)), ...fallback];
  if (fallback.length) console.log(`[collect] ts 실적 0 → af 수집 전환: ${fallback.join(", ")}`);
  const pastDays = pastDaysParam ? parseInt(pastDaysParam) : 2;
  const futureDays = futureDaysParam ? parseInt(futureDaysParam) : 7;
  try {
    // 어제 + 오늘 + 향후 7일 매치 일정/스코어 수집
    // pastDays=2: 어제 시작·오늘 새벽 끝난 매치의 score/status 보정 (RECAP 잡 트리거에 필수)
    // futureDays=7: 미래 SCHEDULED 매치도 채워서 PREVIEW 잡이 잡아갈 수 있게 함
    await runCollect({ leagues, pastDays, futureDays });
    return NextResponse.json({ ok: true, leagues: leagues.length, tsFallback: fallback });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
