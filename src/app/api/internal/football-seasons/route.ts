// GET /api/internal/football-seasons
// Lightsail standings-poller 가 "지금 폴링할 시즌 목록"을 받아가는 엔드포인트.
//
// 왜 필요한가.
//   워커는 지금까지 서버에 수동 복사된 league-id-mapping.json 사본을 읽었다. 저장소와 서버
//   두 파일을 사람이 각각 고쳐야 했고, 새 시즌에 한쪽만 고치면 워커가 지난 시즌 uuid 로
//   조회 → 빈 응답 → 캐시가 작년 표에 동결됐다. 시즌 목록의 단일 진실을 서버로 옮긴다.
//
// 응답은 폴링에 필요한 최소 필드만 준다 — league / tsSeasonId / providerLeagueId / seasonLabel.
// Bearer auth: INTERNAL_API_TOKEN.

import { NextRequest, NextResponse } from "next/server";
import { internalAuthorized } from "@/lib/internal-auth";
import { mergeSeasonList } from "@/lib/sports/season-list";
import { PROVIDER_TS, listActiveSeasons, staticTsTournamentId } from "@/lib/sports/season-registry";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import tsLeagueMap from "@/lib/sports/thesports/league-id-mapping.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!internalAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 폴링 대상 = 축구 리그 집합 ∪ 축구 매핑 파일에 있는 코드.
  // ⚠ 합집합인 이유: BRASILEIRAO_2 처럼 매핑·순위는 있는데 SOCCER_LEAGUES 에는 빠진 코드가 있다.
  //   SOCCER_LEAGUES 만으로 거르면 지금 잘 돌던 리그가 조용히 폴링에서 빠진다.
  const mappedCodes = new Set(
    (tsLeagueMap as Array<{ code: string }>).map((e) => e.code),
  );
  const isTarget = (league: string) => SOCCER_LEAGUES.has(league) || mappedCodes.has(league);

  const active = await listActiveSeasons(PROVIDER_TS);
  const list = mergeSeasonList(
    active.map((s) => ({
      league: s.league,
      providerSeasonId: s.providerSeasonId,
      providerLeagueId: s.providerLeagueId || (staticTsTournamentId(s.league) ?? ""),
      seasonLabel: s.seasonLabel,
    })),
    tsLeagueMap as Array<{ code: string; tsId: string; tsSeasonId?: string }>,
    // 이 엔드포인트는 축구 순위 폴러 전용 — 다른 종목 시즌은 워커가 자체 상수로 관리한다.
    isTarget,
  );

  return NextResponse.json({
    ok: true,
    count: list.length,
    registryCount: list.filter((s) => s.source === "registry").length,
    staticCount: list.filter((s) => s.source === "static").length,
    seasons: list,
  });
}
